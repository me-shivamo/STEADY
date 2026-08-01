import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';
import { todayLocalDate, toLocalDateString } from '../utils/localDate';

export type DayStatus = 'ok' | 'over' | 'today' | 'miss' | 'future';

export interface ProgressDay {
  date: string; // YYYY-MM-DD
  weekday: string; // 'Mon', 'Tue', ...
  calories: number | null;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  status: DayStatus;
}

interface ProgressWeek {
  label: string; // 'This Week' | 'Last Week' | 'Jun 2 – Jun 8'
  rangeLabel: string; // 'Jun 2 – Jun 8'
  days: ProgressDay[];
}

export interface WeekdayPatternResult {
  weekdayAvg: number; // Mon-Fri average calories, logged days only
  weekendAvg: number; // Sat-Sun average calories, logged days only
}

export interface BestWeekResult {
  adherencePct: number; // onGoalDays / elapsedDays, for the best week found
  isCurrentWeekBest: boolean;
}

interface ProgressState {
  weekOffset: number; // 0 = current week, 1 = last week, ...
  week: ProgressWeek | null;
  weekdayPattern: WeekdayPatternResult | null;
  bestWeek: BestWeekResult | null;
  loading: boolean;

  setWeekOffset: (offset: number) => void;
  fetchWeek: () => Promise<void>;
  fetchWeekdayPattern: () => Promise<void>;
  fetchBestWeek: () => Promise<void>;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function todayDate(): string {
  return todayLocalDate();
}

// Monday of the week containing `d`, offset back by `weekOffset` whole weeks.
function weekStart(weekOffset: number): Date {
  return mondayOf(new Date(), weekOffset * 7);
}

// Monday of the week containing `reference`, after subtracting `daysBack`
// calendar days from it first. Generalizes weekStart() so the same
// Monday-anchoring logic can bucket an arbitrary historical date (for the
// best-week scan) instead of only "N weeks back from today".
function mondayOf(reference: Date, daysBack = 0): Date {
  const d = new Date(reference);
  d.setDate(d.getDate() - daysBack);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function fmtDate(d: Date): string {
  return toLocalDateString(d);
}

function fmtRangeLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  weekOffset: 0,
  week: null,
  weekdayPattern: null,
  bestWeek: null,
  loading: false,

  setWeekOffset: (weekOffset) => {
    set({ weekOffset });
    get().fetchWeek();
  },

  fetchWeek: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    const profile = useAuthStore.getState().profile;
    if (!userId) return;

    set({ loading: true });

    const { weekOffset } = get();
    const start = weekStart(weekOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const startStr = fmtDate(start);
    const endStr = fmtDate(end);
    const today = todayDate();

    const { data, error } = await supabase
      .from('daily_summaries')
      .select('summary_date, total_calories, total_protein_g, total_carbs_g, total_fat_g')
      .eq('user_id', userId)
      .gte('summary_date', startStr)
      .lte('summary_date', endStr);

    if (error) {
      console.error('fetchWeek:', error.message);
      set({ loading: false });
      return;
    }

    const byDate = new Map((data ?? []).map((r) => [r.summary_date, r]));
    const calorieGoal = profile?.calorie_goal ?? 2000;

    const days: ProgressDay[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const date = fmtDate(d);
      const row = byDate.get(date);
      const hasLog = !!row && (row.total_calories ?? 0) > 0;

      let status: DayStatus;
      if (date > today) status = 'future';
      else if (date === today) status = 'today';
      else if (!hasLog) status = 'miss';
      else if ((row!.total_calories ?? 0) > calorieGoal) status = 'over';
      else status = 'ok';

      return {
        date,
        weekday: WEEKDAY_LABELS[i],
        calories: hasLog ? Math.round(row!.total_calories ?? 0) : null,
        protein_g: Math.round(row?.total_protein_g ?? 0),
        carbs_g: Math.round(row?.total_carbs_g ?? 0),
        fat_g: Math.round(row?.total_fat_g ?? 0),
        status,
      };
    });

    set({
      week: {
        label: weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Last Week' : fmtRangeLabel(start, end),
        rangeLabel: fmtRangeLabel(start, end),
        days,
      },
      loading: false,
    });
  },

  // Groups the last 8 weeks of logged days into weekday (Mon-Fri) vs weekend
  // (Sat-Sun) buckets to detect an eating pattern — e.g. "weekends run
  // noticeably higher". 8 weeks is long enough to average out one unusually
  // big or small weekend, short enough that a pattern from months ago (which
  // may no longer be true) doesn't dilute a recent shift.
  fetchWeekdayPattern: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const since = new Date();
    since.setDate(since.getDate() - 56); // 8 weeks
    const sinceStr = fmtDate(since);

    const { data, error } = await supabase
      .from('daily_summaries')
      .select('summary_date, total_calories')
      .eq('user_id', userId)
      .gte('summary_date', sinceStr)
      .gt('total_calories', 0);

    if (error || !data) {
      if (error) console.error('fetchWeekdayPattern:', error.message);
      return;
    }

    const weekday: number[] = [];
    const weekend: number[] = [];
    for (const row of data) {
      const day = new Date(row.summary_date + 'T00:00:00').getDay(); // 0=Sun..6=Sat
      (day === 0 || day === 6 ? weekend : weekday).push(row.total_calories ?? 0);
    }

    if (weekday.length === 0 || weekend.length === 0) {
      set({ weekdayPattern: null });
      return;
    }

    set({
      weekdayPattern: {
        weekdayAvg: weekday.reduce((a, b) => a + b, 0) / weekday.length,
        weekendAvg: weekend.reduce((a, b) => a + b, 0) / weekend.length,
      },
    });
  },

  // Scans the last 16 weeks (~4 months) of logged days, buckets them into
  // Mon-Sun weeks, and finds the week with the highest "adherence" — the
  // same percentage-of-days-on-goal used by the Daily Breakdown's own
  // status pills (not a separate, slightly different definition), so this
  // comparison always agrees with what the rest of the screen already shows.
  fetchBestWeek: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    const profile = useAuthStore.getState().profile;
    if (!userId) return;

    const since = new Date();
    since.setDate(since.getDate() - 112); // 16 weeks
    const sinceStr = fmtDate(since);
    const today = todayDate();
    const calorieGoal = profile?.calorie_goal ?? 2000;

    const { data, error } = await supabase
      .from('daily_summaries')
      .select('summary_date, total_calories')
      .eq('user_id', userId)
      .gte('summary_date', sinceStr)
      .lte('summary_date', today);

    if (error || !data) {
      if (error) console.error('fetchBestWeek:', error.message);
      return;
    }

    const byDate = new Map(data.map((r) => [r.summary_date, r.total_calories ?? 0]));

    // Bucket every date that appears in range into its Monday-anchored week.
    const weekBuckets = new Map<string, string[]>(); // mondayKey -> dates in that week
    for (const dateStr of byDate.keys()) {
      const monday = fmtDate(mondayOf(new Date(dateStr + 'T00:00:00')));
      if (!weekBuckets.has(monday)) weekBuckets.set(monday, []);
      weekBuckets.get(monday)!.push(dateStr);
    }

    let bestAdherence = -1;
    let bestMonday: string | null = null;
    for (const [monday, dates] of weekBuckets) {
      // Only count elapsed days (not future days within a partial week).
      const elapsed = dates.filter((d) => d <= today);
      if (elapsed.length === 0) continue;
      const onGoal = elapsed.filter((d) => (byDate.get(d) ?? 0) > 0 && (byDate.get(d) ?? 0) <= calorieGoal).length;
      const adherence = (onGoal / elapsed.length) * 100;
      if (adherence > bestAdherence) {
        bestAdherence = adherence;
        bestMonday = monday;
      }
    }

    if (bestMonday === null) {
      set({ bestWeek: null });
      return;
    }

    const currentWeekMonday = fmtDate(weekStart(get().weekOffset));
    set({
      bestWeek: {
        adherencePct: bestAdherence,
        isCurrentWeekBest: bestMonday === currentWeekMonday,
      },
    });
  },
}));
