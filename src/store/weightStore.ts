import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';

export type WeightEntry = {
  id: string;
  logged_date: string; // 'YYYY-MM-DD'
  weight_kg: number;
  notes: string | null;
};

type Range = '7d' | '30d' | '90d';

interface WeightState {
  entries: WeightEntry[];
  range: Range;
  loading: boolean;

  setRange: (r: Range) => void;
  fetchEntries: () => Promise<void>;
  addEntry: (weight_kg: number, notes?: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

export const useWeightStore = create<WeightState>((set, get) => ({
  entries: [],
  range: '30d',
  loading: false,

  setRange: (range) => {
    set({ range });
    get().fetchEntries();
  },

  fetchEntries: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ loading: true });

    const rangeMap: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = rangeMap[get().range];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('weight_logs')
      .select('id, logged_date, weight_kg, notes')
      .eq('user_id', userId)
      .gte('logged_date', sinceStr)
      .order('logged_date', { ascending: true });

    if (!error && data) {
      set({ entries: data as WeightEntry[] });
    }
    set({ loading: false });
  },

  addEntry: async (weight_kg, notes) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const today = new Date().toISOString().split('T')[0];

    // Upsert — one entry per day; if user logs again today it updates
    const { data, error } = await supabase
      .from('weight_logs')
      .upsert(
        { user_id: userId, logged_date: today, weight_kg, notes: notes ?? null },
        { onConflict: 'user_id,logged_date' }
      )
      .select('id, logged_date, weight_kg, notes')
      .single();

    if (!error && data) {
      // Merge into local entries — replace today's if it exists, else append
      set((s) => {
        const without = s.entries.filter((e) => e.logged_date !== today);
        const updated = [...without, data as WeightEntry].sort((a, b) =>
          a.logged_date.localeCompare(b.logged_date)
        );
        return { entries: updated };
      });

      // Also update profile.current_weight_kg so header card stays in sync
      await useAuthStore.getState().updateProfile({ current_weight_kg: weight_kg });
    }
  },

  deleteEntry: async (id) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    await supabase.from('weight_logs').delete().eq('id', id).eq('user_id', userId);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },
}));
