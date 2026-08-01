import { create } from 'zustand'
import { supabase } from '../api/supabase'
import { Json } from '../types/database'
import { useAuthStore } from './authStore'
import { useFoodLogStore, MealCard, sumTotals, todayDate } from './foodLogStore'

// ── Types ─────────────────────────────────────────────────────────────────────

// One food item snapshotted at save time — mirrors food_entries' nutrition
// columns exactly, so re-logging is a straight copy with no re-resolution.
export interface SavedEntryItem {
  food_name: string
  food_item_id: string | null
  quantity_g: number
  quantity_label: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  macro_source: string | null
}

export interface SavedEntry {
  id: string
  name: string
  entries: SavedEntryItem[]
  created_at: string
  last_used_at: string | null
}

interface SavedEntriesState {
  entries: SavedEntry[]
  loading: boolean
  error: string | null

  fetchSavedEntries: () => Promise<void>
  saveMealAsEntry: (meal: MealCard, name?: string) => Promise<void>
  deleteSavedEntry: (id: string) => Promise<void>
  logSavedEntry: (entryId: string) => Promise<MealCard>
}

function itemFromMealEntry(e: MealCard['entries'][number]): SavedEntryItem {
  return {
    food_name: e.food_name,
    food_item_id: e.food_item_id ?? null,
    quantity_g: e.quantity_g,
    quantity_label: e.quantity_label ?? null,
    calories: e.calories ?? 0,
    protein_g: e.protein_g ?? 0,
    carbs_g: e.carbs_g ?? 0,
    fat_g: e.fat_g ?? 0,
    fiber_g: e.fiber_g ?? null,
    sugar_g: e.sugar_g ?? null,
    sodium_mg: e.sodium_mg ?? null,
    macro_source: e.macro_source ?? null,
  }
}

export const useSavedEntriesStore = create<SavedEntriesState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,

  fetchSavedEntries: async () => {
    const userId = useAuthStore.getState().session?.user.id
    if (!userId) return

    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('saved_entries')
      .select('id, name, entries, created_at, last_used_at')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      set({ loading: false, error: 'Could not load saved entries.' })
      return
    }
    // entries is stored as JSONB — Supabase's generated Json type is a broad
    // union, so it needs an unknown-mediated cast to our known shape.
    set({ entries: (data ?? []) as unknown as SavedEntry[], loading: false })
  },

  saveMealAsEntry: async (meal, name) => {
    const userId = useAuthStore.getState().session?.user.id
    if (!userId) return

    const entryName = name?.trim() || meal.input_text?.trim() || meal.meal_name
    const items = meal.entries.map(itemFromMealEntry)

    const { data, error } = await supabase
      .from('saved_entries')
      .insert({ user_id: userId, name: entryName, entries: items as unknown as Json })
      .select('id, name, entries, created_at, last_used_at')
      .single()

    if (error || !data) {
      set({ error: 'Could not save this entry. Please try again.' })
      return
    }
    set((s) => ({ entries: [data as unknown as SavedEntry, ...s.entries], error: null }))
  },

  deleteSavedEntry: async (id) => {
    const userId = useAuthStore.getState().session?.user.id
    if (!userId) return

    const { error } = await supabase.from('saved_entries').delete().eq('id', id).eq('user_id', userId)
    if (error) {
      set({ error: 'Could not delete this entry. Please try again.' })
      return
    }
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id), error: null }))
  },

  // Re-logs a saved entry as today's meal. Everything needed (macros,
  // food_item_id references) was already resolved when the entry was first
  // saved, so this is a plain insert — no Edge Function call.
  logSavedEntry: async (entryId) => {
    const userId = useAuthStore.getState().session?.user.id
    const entry = get().entries.find((e) => e.id === entryId)
    if (!userId || !entry) throw new Error('Saved entry not found')

    const { data: log, error: logError } = await supabase
      .from('meal_logs')
      .insert({ user_id: userId, logged_date: todayDate(), meal_type: 'other', caption: entry.name })
      .select('id, logged_date, created_at')
      .single()
    if (logError || !log) throw new Error('Could not log this entry. Please try again.')

    const rows = entry.entries.map((item) => ({
      meal_log_id: log.id,
      user_id: userId,
      food_item_id: item.food_item_id,
      food_name: item.food_name,
      quantity_g: item.quantity_g,
      quantity_label: item.quantity_label,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      sugar_g: item.sugar_g,
      sodium_mg: item.sodium_mg,
      macro_source: item.macro_source,
      source: 'saved_entry',
    }))

    const { data: insertedEntries, error: entriesError } = await supabase
      .from('food_entries')
      .insert(rows)
      .select('*')
    if (entriesError) throw new Error('Could not log this entry. Please try again.')

    // Fire-and-forget: bump last_used_at so the sheet can sort by recency.
    supabase.from('saved_entries').update({ last_used_at: new Date().toISOString() }).eq('id', entryId).then()

    const newCard: MealCard = {
      id: log.id,
      meal_name: entry.name,
      meal_type: 'other',
      logged_date: log.logged_date,
      created_at: log.created_at ?? new Date().toISOString(),
      photo_url: null,
      input_text: entry.name,
      entries: (insertedEntries ?? []) as MealCard['entries'],
    }

    // Mirror foodLogStore's own append pattern so Home's feed, Food Log view,
    // and the calorie totals ring all update immediately.
    const foodLogState = useFoodLogStore.getState()
    const updatedMeals = [...foodLogState.meals, newCard]
    useFoodLogStore.setState({ meals: updatedMeals, totals: sumTotals(updatedMeals) })

    set((s) => ({
      entries: s.entries.map((e) => (e.id === entryId ? { ...e, last_used_at: new Date().toISOString() } : e)),
    }))

    return newCard
  },
}))
