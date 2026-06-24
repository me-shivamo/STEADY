import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { supabase } from '../../api/supabase';
import { useAuthStore } from '../../store/authStore';

interface Stats {
  avgCal: string;
  daysLogged: string;
  onGoal: string;
}

// Looks back 7 days (not counting today) and computes the three stat card values.
// "On goal" = days where calories landed within 15% below or 5% above the target.
function useLast7DaysStats(): Stats {
  const profile = useAuthStore((s) => s.profile);
  const [stats, setStats] = useState<Stats>({ avgCal: '—', daysLogged: '—', onGoal: '—' });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !profile) return;

      // Build date range: last 7 days (today-6 through today).
      const today = new Date();
      const dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      const from = dates[0];
      const to = dates[dates.length - 1];

      const { data, error } = await supabase
        .from('daily_summaries')
        .select('total_calories')
        .eq('user_id', user.id)
        .gte('summary_date', from)
        .lte('summary_date', to);

      if (error || !data) return;

      const calorieGoal = profile.calorie_goal ?? 2000;
      // A day "counts" only if the user actually logged something.
      const loggedRows = data.filter(r => (r.total_calories ?? 0) > 0);
      const daysLogged = loggedRows.length;

      const totalCal = loggedRows.reduce((sum, r) => sum + (r.total_calories ?? 0), 0);
      const avgCal = daysLogged > 0 ? Math.round(totalCal / daysLogged) : 0;

      // On-goal: within 15% below target and 5% above target.
      const onGoal = loggedRows.filter(r => {
        const cal = r.total_calories ?? 0;
        return cal >= calorieGoal * 0.85 && cal <= calorieGoal * 1.05;
      }).length;

      setStats({
        avgCal: daysLogged > 0 ? avgCal.toLocaleString() : '—',
        daysLogged: `${daysLogged}/7`,
        onGoal: `${onGoal}/7`,
      });
    }

    load();
  }, [profile]);

  return stats;
}

export default function StatStrip() {
  const { avgCal, daysLogged, onGoal } = useLast7DaysStats();

  const STATS = [
    { value: avgCal,     label: 'Avg cal/day' },
    { value: daysLogged, label: 'Days logged' },
    { value: onGoal,     label: 'On goal' },
  ];

  return (
    <View style={styles.strip}>
      {STATS.map((s) => (
        <View key={s.label} style={styles.card}>
          <Text style={styles.value}>{s.value}</Text>
          <Text style={styles.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  label: {
    fontSize: 11,
    color: C.text2,
    marginTop: 2,
  },
});
