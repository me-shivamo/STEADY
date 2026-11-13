import { create } from 'zustand'
import { supabase } from '../api/supabase'
import { Tables } from '../types/database'
import { todayLocalDate } from '../utils/localDate'
import {
  track, calorieBucket, errorReason, changeBucket, changeDirection, macroSourceBucket, mealMacroSource,
  correctionBasis, MACRO_FIELDS,
} from '../utils/analytics'

// ── Types ─────────────────────────────────────────────────────────────────────

type FoodEntry = Tables<'food_entries'>

// A MealCard is one logged meal (one meal_log row) with all its food entries.
// This is what the home screen renders as a card in the feed.
export interface MealCard {
  id: string          // meal_log_id
  meal_name: string   // AI-generated name e.g. "Omelette sandwich with tomato"
  meal_type: string   // breakfast | lunch | dinner | snack | other
  logged_date: string // YYYY-MM-DD
  created_at: string
  // The photo the user uploaded with this log, if any. null when the meal was
  // logged from text only — the card shows a real image ONLY when this is set.
  photo_url: string | null
  // The raw text the user typed for this log (e.g. "ate 165 gram banana"),
  // shown as the faded gray line at the top of the card. Persisted via meal_logs.caption.
  input_text: string | null
  entries: FoodEntry[]
}

export interface DailyTotals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

// The text Edge Function returns one of two outcomes per message:
//  - 'log'    → food was parsed and saved; we get back a MealCard
//  - 'answer' → it was a question; we get back a conversational reply
// A discriminated union lets callers branch safely on `.type`.
export type LogResult =
  | { type: 'log'; meal: MealCard }
  | { type: 'answer'; reply: string; waterLogged: boolean }

// Photos are never Q&A, but the vision model can decline to guess: when it
// can't identify the food it asks the user to describe it instead, and
// nothing is saved. That question is an outcome to show, not an error.
export type LogPhotoResult =
  | { type: 'log'; meal: MealCard }
  | { type: 'needs_clarification'; message: string }

// Shown only if the server's clarification arrives with no text at all.
const PHOTO_CLARIFY_FALLBACK = "I couldn't tell what's in that photo. Could you type what you ate?"

// A failure the Edge Function reported inside a 200 body ({success:false}).
// `code` carries the server's machine-readable error_code (e.g.
// 'ai_parse_failed') so errorReason()/toUserMessage() can branch on it
// exactly; `waterLogged` says a log_water tool call already succeeded before
// the failure, so the caller can still refresh the water card.
export type FoodLogError = Error & { code?: string; waterLogged?: boolean }

function bodyError(data: any, fallback: string): FoodLogError {
  const err: FoodLogError = new Error(typeof data?.error === 'string' ? data.error : fallback)
  if (typeof data?.error_code === 'string') err.code = data.error_code
  if (data?.water_logged === true) err.waterLogged = true
  return err
}

export interface MacroOverride {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

interface FoodLogState {
  meals: MealCard[]
  totals: DailyTotals
  isLogging: boolean      // true while Edge Function call is in flight
  isFetchingDate: boolean // true while the meals fetch is in flight
  error: string | null
  selectedDate: string  // YYYY-MM-DD; drives which day's feed is shown
  loggedDates: Set<string>  // YYYY-MM-DD dates with a log, for the currently-viewed calendar month

  fetchSummaryForDate: (date: string, userId: string) => Promise<void>
  fetchEntriesForDate: (date?: string, skipTotals?: boolean) => Promise<void>
  fetchLoggedDatesForMonth: (year: number, month: number) => Promise<void>
  setSelectedDate: (date: string) => void
  // Call when the app comes back to the foreground and before logging. If
  // the calendar day changed since the last check and the user was on
  // "today", moves them to the new today and returns true. A past day the
  // user picked on purpose is left alone.
  syncToday: () => boolean
  // loggedDate (YYYY-MM-DD) is the day the meal belongs to — the day the
  // user is looking at. Defaults to today.
  logMealFromText: (text: string, meal_type?: string, loggedDate?: string) => Promise<LogResult>
  logMealFromPhoto: (imageBase64: string, mimeType: string, caption?: string, loggedDate?: string) => Promise<LogPhotoResult>
  editMealFromText: (mealId: string, text: string) => Promise<MealCard>
  // Only the fields present in `overrides` that differ from the stored entry
  // are written. Resolves true if anything was written, false if not.
  updateEntryMacros: (mealId: string, entryId: string, overrides: Partial<MacroOverride>) => Promise<boolean>
  updateMealDateTime: (mealId: string, newDate: string, newCreatedAt: string) => Promise<void>
  deleteMeal: (mealId: string) => Promise<void>
  deleteEntry: (entryId: string) => Promise<void>
  reset: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ZERO: DailyTotals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

export function sumTotals(meals: MealCard[]): DailyTotals {
  const t = { ...ZERO }
  for (const meal of meals) {
    for (const e of meal.entries) {
      t.calories  += e.calories  ?? 0
      t.protein_g += e.protein_g ?? 0
      t.carbs_g   += e.carbs_g   ?? 0
      t.fat_g     += e.fat_g     ?? 0
    }
  }
  // Round to 1 decimal to avoid floating point noise (e.g. 149.99999)
  t.calories  = Math.round(t.calories  * 10) / 10
  t.protein_g = Math.round(t.protein_g * 10) / 10
  t.carbs_g   = Math.round(t.carbs_g   * 10) / 10
  t.fat_g     = Math.round(t.fat_g     * 10) / 10
  return t
}

export function todayDate(): string {
  return todayLocalDate()
}

// The "today" the store last saw (see syncToday). selectedDate starts as
// today, so the two start equal.
let lastSeenToday = todayDate()

// Total calories on a single card — used only to bucket the log for analytics,
// never sent raw. Kept next to sumTotals so the two stay conceptually paired.
function cardCalories(meal: MealCard): number {
  return meal.entries.reduce((sum, e) => sum + (e.calories ?? 0), 0)
}

// Appends a just-logged card to the feed — but only if the user is still
// looking at the day it was logged to. They can swipe to another day while
// the AI call is in flight; appending then would show (and total) a meal
// under a day it doesn't belong to.
function appendIfShown(
  get: () => FoodLogState,
  set: (partial: Partial<FoodLogState>) => void,
  card: MealCard,
): void {
  const { meals, selectedDate } = get()
  if (card.logged_date !== selectedDate) {
    set({ isLogging: false })
    return
  }
  const updated = [...meals, card]
  set({ meals: updated, totals: sumTotals(updated), isLogging: false })
}

function labelFromType(type: string): string {
  const map: Record<string, string> = {
    breakfast: 'Breakfast', lunch: 'Lunch',
    dinner: 'Dinner', snack: 'Snack', other: 'Meal',
  }
  return map[type] ?? 'Meal'
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useFoodLogStore = create<FoodLogState>((set, get) => ({
  meals: [],
  totals: { ...ZERO },
  isLogging: false,
  // Starts true (not false) so the very first render can never race ahead of
  // the initial fetchEntriesForDate() call — see HomeScreen's merge effect,
  // which uses this flag to know whether it's safe to build `messages` yet.
  isFetchingDate: true,
  error: null,
  selectedDate: todayDate(),
  loggedDates: new Set(),

  // Change the active date: fire two queries in parallel.
  // Query A (fast ~50ms): daily_summaries → updates totals + ring immediately.
  // Query B (slow ~200ms): meal_logs + food_entries → fills in the cards after.
  // isFetchingDate stays true until Query B completes so the empty-state bubble
  // doesn't flash before we know whether the day actually has logs.
  setSelectedDate: (date: string) => {
    set({ selectedDate: date, meals: [], totals: { ...ZERO }, isFetchingDate: true })
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { set({ isFetchingDate: false }); return }
      get().fetchSummaryForDate(date, user.id)
      get().fetchEntriesForDate(date, true) // skipTotals — summary query handles it
    })
  },

  // selectedDate is set once at launch and then only by the user, so an app
  // left open on "today" past midnight kept showing (and, since logging goes
  // to the viewed day, logging to) yesterday. "Was on today" is judged
  // against the last today we saw, so a past day picked on purpose stays put.
  syncToday: () => {
    const now = todayDate()
    const previous = lastSeenToday
    lastSeenToday = now
    if (now === previous || get().selectedDate !== previous) return false
    get().setSelectedDate(now)
    return true
  },

  // Fast path: fetch only the pre-aggregated daily_summaries row.
  // Updates the calorie ring + macros almost instantly on date switch.
  fetchSummaryForDate: async (date: string, userId: string) => {
    const { data } = await supabase
      .from('daily_summaries')
      .select('total_calories, total_protein_g, total_carbs_g, total_fat_g')
      .eq('user_id', userId)
      .eq('summary_date', date)
      .maybeSingle()

    if (data) {
      set({
        totals: {
          calories:  Math.round((data.total_calories  ?? 0) * 10) / 10,
          protein_g: Math.round((data.total_protein_g ?? 0) * 10) / 10,
          carbs_g:   Math.round((data.total_carbs_g   ?? 0) * 10) / 10,
          fat_g:     Math.round((data.total_fat_g     ?? 0) * 10) / 10,
        },
      })
    }
    // If no row exists (no logs that day), totals stay at ZERO — correct behaviour.
  },

  // Fetch which dates in a given month have at least one log, for the calendar
  // grid's highlight. Reuses daily_summaries (one row per user per logged day)
  // since existence alone is enough — no need for the heavier meal_logs join.
  fetchLoggedDatesForMonth: async (year: number, month: number) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('daily_summaries')
      .select('summary_date')
      .eq('user_id', user.id)
      .gte('summary_date', firstDay)
      .lte('summary_date', lastDay)

    if (error) {
      console.error('fetchLoggedDatesForMonth:', error.message)
      return
    }

    set({ loggedDates: new Set((data ?? []).map(r => r.summary_date)) })
  },

  // Slow path: fetch meal_logs + food_entries for the cards feed.
  // skipTotals=true when called from setSelectedDate (totals already handled
  // by the fast fetchSummaryForDate path). False on initial app load.
  fetchEntriesForDate: async (date?: string, skipTotals = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { set({ isFetchingDate: false }); return }

    const targetDate = date ?? get().selectedDate

    const { data, error } = await supabase
      .from('meal_logs')
      .select('*, food_entries(*)')
      .eq('user_id', user.id)
      .eq('logged_date', targetDate)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('fetchEntriesForDate:', error.message)
      set({ isFetchingDate: false })
      return
    }

    const meals: MealCard[] = (data ?? []).map(log => ({
      id: log.id,
      meal_name: labelFromType(log.meal_type),
      meal_type: log.meal_type,
      logged_date: log.logged_date,
      created_at: log.created_at ?? new Date().toISOString(),
      photo_url: log.photo_url ?? null,
      input_text: log.caption ?? null,
      entries: (log.food_entries as unknown as FoodEntry[]) ?? [],
    }))

    // Meal photos are private (migration 011): the DB stores storage PATHS,
    // so exchange them for 24h signed URLs in one batch before rendering.
    // Anything already http (a legacy or just-signed URL) passes through.
    const photoPaths = meals
      .map(m => m.photo_url)
      .filter((p): p is string => !!p && !p.startsWith('http'))
    if (photoPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('meal-photos')
        .createSignedUrls(photoPaths, 60 * 60 * 24)
      const urlByPath = new Map<string, string>()
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
      }
      for (const m of meals) {
        if (m.photo_url && !m.photo_url.startsWith('http')) {
          m.photo_url = urlByPath.get(m.photo_url) ?? null
        }
      }
    }

    set(skipTotals
      ? { meals, isFetchingDate: false }
      : { meals, totals: sumTotals(meals), isFetchingDate: false }
    )
  },

  // Call the Edge Function with plain-English text.
  // On success, adds the new MealCard to local state immediately —
  // no need to re-fetch from Supabase, we already have the data.
  logMealFromText: async (text, meal_type, loggedDate) => {
    set({ isLogging: true, error: null })
    // The day being viewed, not always today: logging while looking at a
    // past day used to save to today and then tell the user to switch days.
    // The server already files the meal, its chat turn and the "Current
    // date" it gives the model under whatever date we send here.
    const logged_date = loggedDate ?? todayDate()

    try {
      const { data, error } = await supabase.functions.invoke('log-food-from-text', {
        // logged_hour lets the server infer breakfast/lunch/dinner/snack from
        // the user's own local clock when meal_type is omitted — the server
        // has no timezone of its own, so guessing from its own clock would
        // mislabel meals for anyone outside UTC (e.g. dinner in India would
        // read as UTC afternoon and get called "lunch").
        body: { text, meal_type, logged_date, logged_hour: new Date().getHours() },
      })

      if (error) throw new Error(error.message)
      // Includes the server's typed failures, e.g. error_code 'ai_parse_failed'
      // when the AI's reply couldn't be read (it used to come back as a fake
      // chat answer instead).
      if (!data?.success) throw bodyError(data, 'Logging failed')

      // The AI answered a question — no food to store, just hand back the reply.
      if (data.type === 'answer') {
        set({ isLogging: false })
        if (data.needs_clarification === true) {
          // An "unsure" log: the user described food but nothing could be
          // given a number, so the server asked them instead and saved
          // nothing. That is a failed log attempt, not a Q&A turn.
          track('meal_log_failed', { source: 'text', reason: 'needs_clarification', is_today: logged_date === todayDate() })
        } else {
          track('ai_question_answered', { water_logged: data.water_logged ?? false })
        }
        return { type: 'answer', reply: data.reply ?? '', waterLogged: data.water_logged ?? false }
      }

      // Otherwise it's a food log (default). Build the card for this message.
      const newCard: MealCard = {
        id: data.meal_log_id,
        meal_name: data.meal_name,
        meal_type: data.meal_type,
        logged_date: data.logged_date ?? logged_date,
        created_at: new Date().toISOString(),
        // Text logs carry no photo; the Edge Function returns photo_url only
        // once photo-upload logging exists. Default to null until then.
        photo_url: data.photo_url ?? null,
        // Prefer the echoed input_text; fall back to the text we sent.
        input_text: data.input_text ?? text ?? null,
        entries: data.entries ?? [],
      }

      // Each logged message is now its own meal_log row (no meal_type merging),
      // so we append the new card chronologically (newest at the bottom).
      appendIfShown(get, set, newCard)
      // Captured here rather than in FoodLogChatScreen so that every caller of
      // logMealFromText — the chat screen and Home's inline composer — is
      // counted exactly once, with no chance of the two drifting apart.
      track('meal_logged', {
        source: 'text',
        meal_type: newCard.meal_type,
        calorie_bucket: calorieBucket(cardCalories(newCard)),
        item_count: newCard.entries.length,
        has_photo: newCard.photo_url != null,
        is_today: newCard.logged_date === todayDate(),
      })
      return { type: 'log', meal: newCard }
    } catch (err: any) {
      set({ isLogging: false, error: err.message ?? 'Failed to log meal' })
      track('meal_log_failed', { source: 'text', reason: errorReason(err), is_today: logged_date === todayDate() })
      throw err
    }
  },

  // Call the analyze-food-photo Edge Function with a base64-encoded image.
  // Photos never produce a Q&A answer: the result is either a logged meal or
  // the AI's clarifying question (nothing saved).
  logMealFromPhoto: async (imageBase64, mimeType, caption, loggedDate) => {
    set({ isLogging: true, error: null })
    const logged_date = loggedDate ?? todayDate()

    try {
      const { data, error } = await supabase.functions.invoke('analyze-food-photo', {
        body: {
          image_base64: imageBase64,
          mime_type: mimeType,
          caption: caption ?? '',
          logged_date,
          logged_hour: new Date().getHours(),
        },
      })

      if (error) throw new Error(error.message)

      // The model couldn't identify the food (or nothing in it could be given
      // a number) and asked the user to describe it. Checked BEFORE `success`:
      // this shape is {success:false}, and treating it as a failure threw the
      // question away and showed generic "couldn't log" copy instead.
      if (data?.type === 'needs_clarification') {
        set({ isLogging: false })
        track('meal_log_failed', { source: 'photo', reason: 'needs_clarification', is_today: logged_date === todayDate() })
        const message =
          (typeof data.message === 'string' && data.message.trim()) ||
          (typeof data.error === 'string' && data.error.trim()) ||
          PHOTO_CLARIFY_FALLBACK
        return { type: 'needs_clarification', message }
      }

      if (!data?.success) throw bodyError(data, 'Photo analysis failed')

      const newCard: MealCard = {
        id: data.meal_log_id,
        meal_name: data.meal_name,
        meal_type: data.meal_type,
        logged_date: data.logged_date ?? logged_date,
        created_at: new Date().toISOString(),
        photo_url: data.photo_url ?? null,
        input_text: caption ?? null,
        entries: data.entries ?? [],
      }

      appendIfShown(get, set, newCard)
      track('meal_logged', {
        source: 'photo',
        meal_type: newCard.meal_type,
        calorie_bucket: calorieBucket(cardCalories(newCard)),
        item_count: newCard.entries.length,
        has_photo: true,
        is_today: newCard.logged_date === todayDate(),
      })
      return { type: 'log', meal: newCard }
    } catch (err: any) {
      set({ isLogging: false, error: err.message ?? 'Photo logging failed' })
      track('meal_log_failed', { source: 'photo', reason: errorReason(err), is_today: logged_date === todayDate() })
      throw err
    }
  },

  // Re-evaluate an existing meal from edited text.
  // Sends the existing meal_log_id so the Edge Function rewrites that log's
  // foods in place (delete old entries + insert new), then we replace that one
  // card in our local array at its current position — the feed order is preserved.
  editMealFromText: async (mealId, text) => {
    const existing = get().meals.find(m => m.id === mealId)

    const { data, error } = await supabase.functions.invoke('log-food-from-text', {
      body: {
        text,
        meal_log_id: mealId,
        // Keep the card's original slot/date so the re-eval doesn't reclassify them.
        meal_type: existing?.meal_type,
        logged_date: existing?.logged_date ?? todayDate(),
        // The entries as they exist right now, before this edit. The function
        // uses these to tell "same food, new quantity" (rescale the existing
        // macros) apart from "genuinely different food" (re-resolve from
        // scratch) — without this, editing "60 g" to "90 g" in the text blob
        // re-derives nutrition facts from the AI's own knowledge instead of
        // the verified numbers the entry already had (e.g. a label photo's
        // exact printed macros). The server pairs foods with these by name,
        // and by a short per-entry ref the model echoes for renamed foods.
        previous_entries: existing?.entries.map(e => ({
          name: e.food_name,
          quantity_g: e.quantity_g,
          calories: e.calories,
          protein_g: e.protein_g,
          carbs_g: e.carbs_g,
          fat_g: e.fat_g,
          fiber_g: e.fiber_g,
          food_item_id: e.food_item_id,
          macro_source: e.macro_source,
        })) ?? [],
      },
    })

    if (error) {
      track('meal_edit_failed', { reason: errorReason(error) })
      throw new Error(error.message)
    }
    if (!data?.success) {
      const err = bodyError(data, 'Update failed')
      track('meal_edit_failed', { reason: errorReason(err) })
      throw err
    }
    // An edit must resolve to food; if the AI read it as a question, surface that.
    if (data.type !== 'log') {
      track('meal_edit_failed', { reason: 'not_food' })
      throw new Error("That didn't look like food — try describing what you ate.")
    }

    const updatedCard: MealCard = {
      id: data.meal_log_id,
      meal_name: data.meal_name,
      meal_type: data.meal_type,
      logged_date: data.logged_date,
      // Preserve the original timestamp so the card keeps its place in the feed.
      created_at: existing?.created_at ?? new Date().toISOString(),
      // In-memory cards hold signed URLs; the function may echo back a bare
      // storage path — keep the card's working signed URL in that case.
      photo_url: (data.photo_url && String(data.photo_url).startsWith('http'))
        ? data.photo_url
        : existing?.photo_url ?? null,
      // The gray line is what the user TYPED, so an edit leaves it exactly as
      // it was (null included). The edit text is the AI's own summary
      // ("Bread (2 slices), Tomato (42 g)"); letting it replace the caption
      // erased the user's words on every edit.
      input_text: existing ? existing.input_text : (data.input_text ?? text),
      entries: data.entries ?? [],
    }

    // Older deployed versions of the function also wrote the edit text into
    // meal_logs.caption, so put back what the card showed, or the summary
    // returns on the next reload. The current function leaves the caption
    // alone and says so with caption_kept. Best effort: the edit itself
    // already succeeded, and a failure here only costs the caption.
    if (existing && data.caption_kept !== true && (data.input_text ?? null) !== existing.input_text) {
      const { error: captionErr } = await supabase
        .from('meal_logs')
        .update({ caption: existing.input_text })
        .eq('id', mealId)
      if (captionErr) console.warn('editMealFromText: could not restore caption:', captionErr.message)
    }

    // Swap the card in place (same index); everything else is untouched.
    const updated = get().meals.map(m => (m.id === mealId ? updatedCard : m))
    set({ meals: updated, totals: sumTotals(updated) })
    track('meal_edited', { item_count: updatedCard.entries.length })
    if (existing) {
      // One meal-level correction event: the server replaces every entry on
      // an edit and returns no per-entry match, so the meal is the unit.
      const before = cardCalories(existing)
      const after = cardCalories(updatedCard)
      track('food_corrected', {
        method: 'edit',
        macro_source: mealMacroSource(existing.entries.map(e => e.macro_source)),
        basis: 'calories',
        direction: changeDirection(before, after),
        change_bucket: changeBucket(before, after),
      })
    }
    return updatedCard
  },

  // Patch a single food_entry's macro values directly in Supabase.
  // This is the "manual override" path — bypasses the AI, lets the user
  // correct values that the AI got slightly wrong.
  //
  // Only the fields the user changed are written (the screen passes just
  // those), so an untouched field keeps its exact stored value instead of
  // the whole-number copy the form displays. macro_source becomes
  // 'user_created' because the numbers are now the user's, not USDA's or
  // the AI's. food_item_id stays: a later text edit rescales from this
  // entry's own (now corrected) numbers, and that guard needs the id.
  //
  // A field already equal to the stored value is dropped, and an entry with
  // nothing left is neither written nor tracked. The screen compares against
  // the values it opened with, so a retry after a partial failure (or a
  // double tap) re-sends rows that were already saved; without this each
  // one would be re-stamped and counted as a second, fake correction.
  updateEntryMacros: async (mealId, entryId, overrides) => {
    // Read before patching: for the no-op check and the correction event.
    const before = get().meals.find(m => m.id === mealId)?.entries.find(e => e.id === entryId)
    const fields: Partial<MacroOverride> = {}
    for (const k of MACRO_FIELDS) {
      const v = overrides[k]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      // Compared at 0.1, the precision the form saves at.
      if (before && Math.round((before[k] ?? 0) * 10) === Math.round(v * 10)) continue
      fields[k] = v
    }
    const fieldsChanged = Object.keys(fields).length
    if (fieldsChanged === 0) return false

    const patch = { ...fields, macro_source: 'user_created' as const }

    const { error } = await supabase
      .from('food_entries')
      .update(patch)
      .eq('id', entryId)

    if (error) throw error

    // Update local state: find the meal, find the entry, swap its macros.
    const updated = get().meals.map(meal => {
      if (meal.id !== mealId) return meal
      return {
        ...meal,
        entries: meal.entries.map(e =>
          e.id === entryId
            ? { ...e, ...patch }
            : e
        ),
      }
    })
    set({ meals: updated, totals: sumTotals(updated) })

    if (before) {
      // Direction and size are measured on one field: calories when they
      // changed, else the macro that moved most (a protein-only fix used to
      // read as "none, 0-5%", the same as no change at all).
      const basis = correctionBasis(before, fields)
      const oldValue = before[basis] ?? 0
      const newValue = fields[basis] ?? oldValue
      track('food_corrected', {
        method: 'adjust_macros',
        // The source the user is correcting — what the pipeline got wrong.
        macro_source: macroSourceBucket(before.macro_source),
        basis,
        direction: changeDirection(oldValue, newValue),
        change_bucket: changeBucket(oldValue, newValue),
        fields_changed: fieldsChanged,
      })
    }
    return true
  },

  // Move a meal to a different date/time.
  // Patches logged_date and created_at on the meal_logs row, then re-slots the
  // card in local state: if the new date matches the currently selected date it
  // stays visible (with updated timestamp); otherwise it's removed from the feed
  // so the user isn't looking at a card that belongs to a different day.
  updateMealDateTime: async (mealId, newDate, newCreatedAt) => {
    const { error } = await supabase
      .from('meal_logs')
      .update({ logged_date: newDate, created_at: newCreatedAt })
      .eq('id', mealId)

    if (error) throw error

    const { selectedDate } = get()
    let updated: MealCard[]

    if (newDate === selectedDate) {
      // Same day — keep the card, just update its timestamp so the footer time refreshes.
      updated = get().meals.map(m =>
        m.id === mealId
          ? { ...m, logged_date: newDate, created_at: newCreatedAt }
          : m
      )
    } else {
      // Different day — remove from current feed; it'll appear when the user navigates to that date.
      updated = get().meals.filter(m => m.id !== mealId)
    }

    set({ meals: updated, totals: sumTotals(updated) })
    track('meal_datetime_changed', { moved_to_different_day: newDate !== selectedDate })
  },

  // Delete an entire meal log (and all its food_entries via ON DELETE CASCADE).
  // Removes from DB first, then drops the card from local state.
  deleteMeal: async (mealId) => {
    const { error } = await supabase
      .from('meal_logs')
      .delete()
      .eq('id', mealId)

    if (error) throw error

    const updated = get().meals.filter(m => m.id !== mealId)
    set({ meals: updated, totals: sumTotals(updated) })
    track('meal_deleted', {})
  },

  // Delete a single food entry (for swipe-to-delete in task 3.5).
  // Removes from DB first, then updates local state optimistically.
  deleteEntry: async (entryId) => {
    const { error } = await supabase
      .from('food_entries')
      .delete()
      .eq('id', entryId)

    if (error) throw error

    const updated = get().meals
      .map(meal => ({ ...meal, entries: meal.entries.filter(e => e.id !== entryId) }))
      .filter(meal => meal.entries.length > 0)

    set({ meals: updated, totals: sumTotals(updated) })
    track('food_entry_deleted', {})
  },

  // Clear everything on sign-out so the next user starts fresh.
  // isFetchingDate resets to true (not false) for the same reason as the
  // initial state above — HomeScreen's merge effect must see "still fetching"
  // until the next login's fetchEntriesForDate() actually resolves.
  reset: () => {
    lastSeenToday = todayDate()
    set({ meals: [], totals: { ...ZERO }, isLogging: false, isFetchingDate: true, error: null, selectedDate: lastSeenToday, loggedDates: new Set() })
  },
}))
