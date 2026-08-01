import { create } from 'zustand';
import { Alert } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';
import { todayLocalDate, daysAgoLocalDate } from '../utils/localDate';

export type WeightEntry = {
  id: string;
  logged_date: string; // 'YYYY-MM-DD'
  weight_kg: number;
  notes: string | null;
};

type Range = '7d' | '30d' | '90d';

export interface WeightTrendPoint {
  date: string; // YYYY-MM-DD
  raw: number;  // the actual logged weight_kg that day
  trend: number; // smoothed "trend weight" (EWMA)
}

// Base smoothing factor for the trend line. Weighing yourself day to day is
// noisy (water, food mass, sodium) even when the real underlying trend hasn't
// moved — the classic "the scale says +1kg but you know you didn't gain fat
// overnight" problem. An EWMA (exponentially weighted moving average) fixes
// this the same way a low-pass filter smooths a noisy sensor reading: each
// new entry nudges the trend line toward it by a fraction (alpha) instead of
// jumping straight to it. 0.15 sits in the middle of what apps like this
// typically use (0.1 = smoother/slower, 0.25 = more responsive/noisier).
export const EWMA_ALPHA = 0.15;

// entries must be sorted ascending by logged_date before calling this.
function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / msPerDay);
}

// Computes a smoothed "trend weight" line alongside the raw entries.
//
// weight_logs is one row per day the user actually weighed in — not every
// calendar day — so a plain fixed-alpha EWMA would treat "logged again
// tomorrow" and "logged again 5 days later" identically, which understates
// how much the trend should move after a real gap. Instead we scale alpha up
// for bigger gaps: effectiveAlpha = 1 - (1 - alpha)^daysElapsed. This is the
// standard continuous-time generalization of EWMA — with a 1-day gap it's
// just `alpha`; with a 5-day gap it's 1 - 0.85^5 ≈ 0.56, so the trend closes
// more than half the distance to the new reading instead of barely moving.
// Without this, someone logging once a week would see a trend line that
// looks stuck even after a real change.
export function computeWeightTrend(
  entries: WeightEntry[],
  alpha: number = EWMA_ALPHA
): WeightTrendPoint[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.logged_date.localeCompare(b.logged_date));
  const points: WeightTrendPoint[] = [
    { date: sorted[0].logged_date, raw: sorted[0].weight_kg, trend: sorted[0].weight_kg },
  ];

  for (let i = 1; i < sorted.length; i++) {
    const daysElapsed = Math.max(1, daysBetween(sorted[i - 1].logged_date, sorted[i].logged_date));
    const effectiveAlpha = 1 - Math.pow(1 - alpha, daysElapsed);
    const prevTrend = points[i - 1].trend;
    const trend = prevTrend + effectiveAlpha * (sorted[i].weight_kg - prevTrend);
    points.push({ date: sorted[i].logged_date, raw: sorted[i].weight_kg, trend });
  }

  return points;
}

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
    const sinceStr = daysAgoLocalDate(days);

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

    const today = todayLocalDate();

    // Upsert — one entry per day; if user logs again today it updates
    const { data, error } = await supabase
      .from('weight_logs')
      .upsert(
        { user_id: userId, logged_date: today, weight_kg, notes: notes ?? null },
        { onConflict: 'user_id,logged_date' }
      )
      .select('id, logged_date, weight_kg, notes')
      .single();

    if (error || !data) {
      Alert.alert('Could not save weight', 'Check your connection and try again.');
      return;
    }

    // Merge into local entries — replace today's if it exists, else append
    set((s) => {
      const without = s.entries.filter((e) => e.logged_date !== today);
      const updated = [...without, data as WeightEntry].sort((a, b) =>
        a.logged_date.localeCompare(b.logged_date)
      );
      return { entries: updated };
    });

    // Also update profile.current_weight_kg so header card stays in sync.
    // Best-effort: the weight row is already saved, so a failed profile sync
    // must not escape as an unhandled rejection (updateProfile throws).
    try {
      await useAuthStore.getState().updateProfile({ current_weight_kg: weight_kg });
    } catch (e) {
      console.warn('Profile weight sync failed:', e);
    }
  },

  deleteEntry: async (id) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const { error } = await supabase.from('weight_logs').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      Alert.alert('Could not delete', 'Check your connection and try again.');
      return;
    }
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },
}));
