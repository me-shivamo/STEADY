import { create } from 'zustand'
import { supabase } from '../api/supabase'
import { Tables } from '../types/database'

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

// Photo logging always produces a food log — photos are never Q&A.
export type LogPhotoResult = { type: 'log'; meal: MealCard }

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
  logMealFromText: (text: string, meal_type?: string) => Promise<LogResult>
  logMealFromPhoto: (imageBase64: string, mimeType: string, caption?: string) => Promise<LogPhotoResult>
  editMealFromText: (mealId: string, text: string) => Promise<MealCard>
  updateEntryMacros: (mealId: string, entryId: string, overrides: MacroOverride) => Promise<void>
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
  return new Date().toISOString().split('T')[0]
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
  isFetchingDate: false,
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
  logMealFromText: async (text, meal_type) => {
    set({ isLogging: true, error: null })

    try {
      const { data, error } = await supabase.functions.invoke('log-food-from-text', {
        body: { text, meal_type, logged_date: todayDate() },
      })

      if (error) throw new Error(error.message)
      if (!data?.success) throw new Error(data?.error ?? 'Logging failed')

      // The AI answered a question — no food to store, just hand back the reply.
      if (data.type === 'answer') {
        set({ isLogging: false })
        return { type: 'answer', reply: data.reply ?? '', waterLogged: data.water_logged ?? false }
      }

      // Otherwise it's a food log (default). Build the card for this message.
      const newCard: MealCard = {
        id: data.meal_log_id,
        meal_name: data.meal_name,
        meal_type: data.meal_type,
        logged_date: data.logged_date,
        created_at: new Date().toISOString(),
        // Text logs carry no photo; the Edge Function returns photo_url only
        // once photo-upload logging exists. Default to null until then.
        photo_url: data.photo_url ?? null,
        // Prefer the echoed input_text; fall back to the text we sent.
        input_text: data.input_text ?? text ?? null,
        entries: data.entries ?? [],
      }

      // Each logged message is now its own meal_log row (no meal_type merging),
      // so we always append the new card chronologically (newest at the bottom).
      const updated = [...get().meals, newCard]

      set({ meals: updated, totals: sumTotals(updated), isLogging: false })
      return { type: 'log', meal: newCard }
    } catch (err: any) {
      set({ isLogging: false, error: err.message ?? 'Failed to log meal' })
      throw err
    }
  },

  // Call the analyze-food-photo Edge Function with a base64-encoded image.
  // Photos always produce a food log (never a Q&A answer), so the return type
  // is always { type: 'log', meal: MealCard }.
  logMealFromPhoto: async (imageBase64, mimeType, caption) => {
    set({ isLogging: true, error: null })

    try {
      const { data, error } = await supabase.functions.invoke('analyze-food-photo', {
        body: {
          image_base64: imageBase64,
          mime_type: mimeType,
          caption: caption ?? '',
          logged_date: todayDate(),
        },
      })

      if (error) throw new Error(error.message)
      if (!data?.success) throw new Error(data?.error ?? 'Photo analysis failed')

      const newCard: MealCard = {
        id: data.meal_log_id,
        meal_name: data.meal_name,
        meal_type: data.meal_type,
        logged_date: data.logged_date,
        created_at: new Date().toISOString(),
        photo_url: data.photo_url ?? null,
        input_text: caption ?? null,
        entries: data.entries ?? [],
      }

      const updated = [...get().meals, newCard]
      set({ meals: updated, totals: sumTotals(updated), isLogging: false })
      return { type: 'log', meal: newCard }
    } catch (err: any) {
      set({ isLogging: false, error: err.message ?? 'Photo logging failed' })
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
      },
    })

    if (error) throw new Error(error.message)
    if (!data?.success) throw new Error(data?.error ?? 'Update failed')
    // An edit must resolve to food; if the AI read it as a question, surface that.
    if (data.type !== 'log') {
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
      input_text: data.input_text ?? text,
      entries: data.entries ?? [],
    }

    // Swap the card in place (same index); everything else is untouched.
    const updated = get().meals.map(m => (m.id === mealId ? updatedCard : m))
    set({ meals: updated, totals: sumTotals(updated) })
    return updatedCard
  },

  // Patch a single food_entry's macro values directly in Supabase.
  // This is the "manual override" path — bypasses the AI, lets the user
  // correct values that the AI got slightly wrong.
  updateEntryMacros: async (mealId, entryId, overrides) => {
    const { error } = await supabase
      .from('food_entries')
      .update({
        calories:  overrides.calories,
        protein_g: overrides.protein_g,
        carbs_g:   overrides.carbs_g,
        fat_g:     overrides.fat_g,
      })
      .eq('id', entryId)

    if (error) throw error

    // Update local state: find the meal, find the entry, swap its macros.
    const updated = get().meals.map(meal => {
      if (meal.id !== mealId) return meal
      return {
        ...meal,
        entries: meal.entries.map(e =>
          e.id === entryId
            ? { ...e, ...overrides }
            : e
        ),
      }
    })
    set({ meals: updated, totals: sumTotals(updated) })
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
  },

  // Clear everything on sign-out so the next user starts fresh.
  reset: () => set({ meals: [], totals: { ...ZERO }, isLogging: false, error: null, selectedDate: todayDate(), loggedDates: new Set() }),
}))
