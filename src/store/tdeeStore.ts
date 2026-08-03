import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';
import { computeWeightTrend } from './weightStore';
import { todayLocalDate, daysAgoLocalDate } from '../utils/localDate';
import { track } from '../utils/analytics';

// Rough energy density of 1kg of body-mass change. This is the standard
// "3500 kcal per lb" rule of thumb (≈7700 kcal/kg) used across nutrition
// apps (including MacroFactor, whose TDEE feature this is modeled on) — a
// population-average approximation, not an exact physical constant. Real
// tissue change is a mix of fat, lean mass, and (especially in the first
// couple of weeks) water/glycogen, which is exactly why this estimate is fed
// trend weight, not raw daily weigh-ins — raw weight swings from water alone
// would otherwise wreck the estimate. Treat this as directional guidance,
// not medical precision.
export const KCAL_PER_KG = 7700;

const WINDOW_DAYS = 28;
const MIN_LOGGED_DAYS = 14;
const MIN_WEIGHT_SPAN_DAYS = 14;

export interface TdeeEstimate {
  windowDays: number;
  avgDailyIntake: number;
  weightChangeKg: number;
  estimatedTdee: number;
  smoothedTdee: number;
  calorieGoal: number;
  deltaVsGoal: number; // smoothedTdee - calorieGoal
}

interface TdeeState {
  estimate: TdeeEstimate | null;
  status: 'insufficient_data' | 'ready';
  daysLogged: number;
  weightSpanDays: number;
  loading: boolean;

  fetchEstimate: () => Promise<void>;
}

function todayDate(): string {
  return todayLocalDate();
}

function daysAgoDate(days: number): string {
  return daysAgoLocalDate(days);
}

export const useTdeeStore = create<TdeeState>((set, get) => ({
  estimate: null,
  status: 'insufficient_data',
  daysLogged: 0,
  weightSpanDays: 0,
  loading: false,

  fetchEstimate: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    const profile = useAuthStore.getState().profile;
    if (!userId) return;

    set({ loading: true });

    const sinceStr = daysAgoDate(WINDOW_DAYS);

    const [{ data: summaries, error: summariesError }, { data: weights, error: weightsError }] =
      await Promise.all([
        supabase
          .from('daily_summaries')
          .select('summary_date, total_calories')
          .eq('user_id', userId)
          .gte('summary_date', sinceStr)
          .gt('total_calories', 0),
        supabase
          .from('weight_logs')
          .select('id, logged_date, weight_kg, notes')
          .eq('user_id', userId)
          .gte('logged_date', sinceStr)
          .order('logged_date', { ascending: true }),
      ]);

    if (summariesError || weightsError) {
      console.error('fetchEstimate:', summariesError?.message ?? weightsError?.message);
      set({ loading: false });
      return;
    }

    const loggedDays = summaries ?? [];
    const weightEntries = weights ?? [];

    const daysLogged = loggedDays.length;
    const weightSpanDays =
      weightEntries.length >= 2
        ? Math.round(
            (new Date(weightEntries[weightEntries.length - 1].logged_date + 'T00:00:00').getTime() -
              new Date(weightEntries[0].logged_date + 'T00:00:00').getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : 0;

    if (daysLogged < MIN_LOGGED_DAYS || weightSpanDays < MIN_WEIGHT_SPAN_DAYS) {
      set({
        estimate: null,
        status: 'insufficient_data',
        daysLogged,
        weightSpanDays,
        loading: false,
      });
      // The ratio of has_estimate false-to-true tells us how many people ever
      // log consistently enough to unlock TDEE at all — the feature is useless
      // if that number stays near zero, and no screen view would reveal it.
      track('tdee_estimate_viewed', { has_estimate: false });
      return;
    }

    const avgDailyIntake =
      loggedDays.reduce((sum, d) => sum + (d.total_calories ?? 0), 0) / daysLogged;

    // Trend weight (not raw) at the edges of the window — smooths out the
    // water-weight noise that would otherwise dominate a short 28-day delta.
    const trend = computeWeightTrend(weightEntries as any);
    const weightChangeKg = trend[trend.length - 1].trend - trend[0].trend;

    // Energy balance: if the user lost weight while eating avgDailyIntake,
    // their true maintenance (TDEE) must be HIGHER than what they ate — the
    // deficit is what produced the loss. weightChangeKg is negative when
    // losing, so subtracting a negative number correctly adds to the estimate.
    const estimatedTdee = avgDailyIntake - (weightChangeKg * KCAL_PER_KG) / WINDOW_DAYS;

    // Blend with the previous estimate so the number doesn't jump around
    // week to week just because the 28-day window rolled forward by a day.
    // In-memory only (not persisted) — the rolling window already does most
    // of the smoothing, so losing this blend on app restart is a small cost.
    const prev = get().estimate?.smoothedTdee;
    const smoothedTdee = prev != null ? 0.7 * prev + 0.3 * estimatedTdee : estimatedTdee;

    const calorieGoal = profile?.calorie_goal ?? 2000;

    set({
      estimate: {
        windowDays: WINDOW_DAYS,
        avgDailyIntake: Math.round(avgDailyIntake),
        weightChangeKg: Math.round(weightChangeKg * 10) / 10,
        estimatedTdee: Math.round(estimatedTdee),
        smoothedTdee: Math.round(smoothedTdee),
        calorieGoal,
        deltaVsGoal: Math.round(smoothedTdee - calorieGoal),
      },
      status: 'ready',
      daysLogged,
      weightSpanDays,
      loading: false,
    });
    track('tdee_estimate_viewed', { has_estimate: true });
  },
}));
