import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';

// Current logging streak, computed live from daily_summaries: consecutive days
// with calories logged, walking backwards from today. Today is forgiven if
// nothing is logged yet — an unfinished morning shouldn't show a broken streak.
//
// Pass anything that should retrigger the computation as `refreshKey` (e.g.
// today's meal count) so the streak ticks over right after the first log of
// the day instead of waiting for a remount.
export function useStreak(refreshKey?: unknown): number | null {
  const userId = useAuthStore((s) => s.session?.user.id);
  const [streak, setStreak] = useState<number | null>(null);

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

      const logged = new Set(data.map((r) => r.summary_date));
      const day = new Date();
      if (!logged.has(format(day, 'yyyy-MM-dd'))) day.setDate(day.getDate() - 1);

      let count = 0;
      while (logged.has(format(day, 'yyyy-MM-dd'))) {
        count += 1;
        day.setDate(day.getDate() - 1);
      }
      if (!cancelled) setStreak(count);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  return streak;
}
