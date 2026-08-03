import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';
import { todayLocalDate, daysAgoLocalDate } from '../utils/localDate';
import { track } from '../utils/analytics';

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

export interface LatestMeasurementSummary {
  latestField: 'body_fat_pct' | 'waist_cm' | null;
  latestValue: number | null;
  deltaFromPrevious: number | null;
  latestDate: string | null;
}

interface BodyMeasurementsState {
  entries: BodyMeasurementEntry[];
  range: Range;
  loading: boolean;
  latestSummary: LatestMeasurementSummary | null;
  latestSummaryLoading: boolean;

  setRange: (r: Range) => void;
  fetchEntries: () => Promise<void>;
  fetchLatestTwo: () => Promise<void>;
  addEntry: (values: MeasurementInput) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

export const useBodyMeasurementsStore = create<BodyMeasurementsState>((set, get) => ({
  entries: [],
  range: '90d',
  loading: false,
  latestSummary: null,
  latestSummaryLoading: false,

  setRange: (range) => {
    set({ range });
    track('measurement_range_changed', { range });
    get().fetchEntries();
  },

  fetchEntries: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ loading: true });

    const rangeMap: Record<Range, number> = { '30d': 30, '90d': 90, '1y': 365 };
    const days = rangeMap[get().range];
    const sinceStr = daysAgoLocalDate(days);

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

    const today = todayLocalDate();

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

      // Which body parts people bother to track is a product question worth
      // answering; the circumferences themselves are nobody's business, so
      // only the field names travel — never `values`.
      const fields = Object.keys(values);
      track('measurements_logged', { fields, field_count: fields.length });
    }
  },

  deleteEntry: async (id) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    await supabase.from('body_measurements').delete().eq('id', id).eq('user_id', userId);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    track('measurement_entry_deleted', {});
  },

  // Lightweight fetch for the Progress screen's trend-link card — only the
  // 2 most recent rows and 2 columns, regardless of the `range` setting,
  // since all that's needed here is "latest value + direction of change",
  // not a full chart's worth of history.
  fetchLatestTwo: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ latestSummaryLoading: true });

    const { data, error } = await supabase
      .from('body_measurements')
      .select('logged_date, waist_cm, body_fat_pct')
      .eq('user_id', userId)
      .order('logged_date', { ascending: false })
      .limit(2);

    if (error || !data || data.length === 0) {
      if (error) console.error('fetchLatestTwo:', error.message);
      set({ latestSummary: null, latestSummaryLoading: false });
      return;
    }

    const [latest, previous] = data;
    // Prefer body_fat_pct as the single headline number when present — it's
    // more informative than a circumference measurement — else fall back to waist.
    const field: 'body_fat_pct' | 'waist_cm' | null =
      latest.body_fat_pct != null ? 'body_fat_pct' : latest.waist_cm != null ? 'waist_cm' : null;

    const latestValue = field ? latest[field] : null;
    const previousValue = field && previous ? previous[field] : null;

    set({
      latestSummary: {
        latestField: field,
        latestValue,
        deltaFromPrevious:
          latestValue != null && previousValue != null ? latestValue - previousValue : null,
        latestDate: latest.logged_date,
      },
      latestSummaryLoading: false,
    });
  },
}));
