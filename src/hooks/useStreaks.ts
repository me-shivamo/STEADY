import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';

export interface Streaks {
  current: number;
  best: number;
}

// Like useStreak, but also computes the all-time longest streak. Kept as a
// separate hook (rather than changing useStreak's return shape) so the 3
// existing call sites that expect a plain number back are left untouched.
//
// Reuses the exact same query as useStreak (daily_summaries where
// total_calories > 0, capped at the last 366 days) — computing "best" from
// rows we're already fetching for "current" costs one extra linear pass
// over at most 366 rows, not a second network round-trip.
export function useStreaks(refreshKey?: unknown): Streaks | null {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [streaks, setStreaks] = useState<Streaks | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('daily_summaries')
        .select('summary_date')
        .eq('user_id', userId)
        .gt('total_calories', 0)
        .order('summary_date', { ascending: false })
        .limit(366);
      if (cancelled || error || !data) return;

      const loggedDates = data.map((r) => r.summary_date);
      const logged = new Set(loggedDates);

      // Current streak: walk backward from today, forgiving today if it
      // hasn't been logged yet (same logic as useStreak).
      const day = new Date();
      if (!logged.has(format(day, 'yyyy-MM-dd'))) day.setDate(day.getDate() - 1);
      let current = 0;
      while (logged.has(format(day, 'yyyy-MM-dd'))) {
        current += 1;
        day.setDate(day.getDate() - 1);
      }

      // Best streak: longest run of consecutive calendar dates anywhere in
      // the history we fetched. Sort ascending and track a running length,
      // resetting whenever the gap to the previous date isn't exactly 1 day.
      const sortedAscending = [...loggedDates].sort();
      let best = 0;
      let runLength = 0;
      let prevDate: Date | null = null;
      for (const dateStr of sortedAscending) {
        const date = new Date(dateStr + 'T00:00:00');
        if (prevDate) {
          const dayGap = Math.round((date.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));
          runLength = dayGap === 1 ? runLength + 1 : 1;
        } else {
          runLength = 1;
        }
        best = Math.max(best, runLength);
        prevDate = date;
      }

      if (!cancelled) setStreaks({ current, best: Math.max(best, current) });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  return streaks;
}
