import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';

/**
 * The 3 quick-stat cards under the header (Avg cal/day · Days logged · On goal).
 *
 * Values are PLACEHOLDERS this pass — they'll be wired to the `daily_summaries` /
 * `streaks` tables in a later phase. Kept as a tiny presentational component so the
 * eventual swap to live data is a one-file change.
 */

const STATS: { value: string; label: string }[] = [
  { value: '1,780', label: 'Avg cal/day' },
  { value: '6/7', label: 'Days logged' },
  { value: '5/7', label: 'On goal' },
];

export default function StatStrip() {
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
