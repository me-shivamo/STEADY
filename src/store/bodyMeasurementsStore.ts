import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';

export type MeasurementField =
  | 'waist_cm' | 'hips_cm' | 'chest_cm' | 'arms_cm' | 'thighs_cm' | 'neck_cm' | 'body_fat_pct';

export type BodyMeasurementEntry = {
  id: string;
  logged_date: string; // 'YYYY-MM-DD'
  waist_cm: number | null;
  hips_cm: number | null;
  chest_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  neck_cm: number | null;
  body_fat_pct: number | null;
};

export type MeasurementInput = Partial<Record<MeasurementField, number>>;

type Range = '30d' | '90d' | '1y';

interface BodyMeasurementsState {
  entries: BodyMeasurementEntry[];
  range: Range;
  loading: boolean;

  setRange: (r: Range) => void;
  fetchEntries: () => Promise<void>;
  addEntry: (values: MeasurementInput) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

export const useBodyMeasurementsStore = create<BodyMeasurementsState>((set, get) => ({
  entries: [],
  range: '90d',
  loading: false,

  setRange: (range) => {
    set({ range });
    get().fetchEntries();
  },

  fetchEntries: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ loading: true });

    const rangeMap: Record<Range, number> = { '30d': 30, '90d': 90, '1y': 365 };
    const days = rangeMap[get().range];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('body_measurements')
      .select('id, logged_date, waist_cm, hips_cm, chest_cm, arms_cm, thighs_cm, neck_cm, body_fat_pct')
      .eq('user_id', userId)
      .gte('logged_date', sinceStr)
      .order('logged_date', { ascending: true });

    if (!error && data) {
      set({ entries: data as BodyMeasurementEntry[] });
    }
    set({ loading: false });
  },

  addEntry: async (values) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const today = new Date().toISOString().split('T')[0];

    // Upsert — one entry per day, same as weight_logs. Unset fields stay
    // whatever they already were for today (undefined keys are simply
    // omitted from the payload, not overwritten to null).
    const { data, error } = await supabase
      .from('body_measurements')
      .upsert(
        { user_id: userId, logged_date: today, ...values },
        { onConflict: 'user_id,logged_date' }
      )
      .select('id, logged_date, waist_cm, hips_cm, chest_cm, arms_cm, thighs_cm, neck_cm, body_fat_pct')
      .single();

    if (!error && data) {
      set((s) => {
        const without = s.entries.filter((e) => e.logged_date !== today);
        const updated = [...without, data as BodyMeasurementEntry].sort((a, b) =>
          a.logged_date.localeCompare(b.logged_date)
        );
        return { entries: updated };
      });
    }
  },

  deleteEntry: async (id) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    await supabase.from('body_measurements').delete().eq('id', id).eq('user_id', userId);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },
}));
