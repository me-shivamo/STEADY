import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { useStreak } from '../../hooks/useStreak';

/**
 * Profile drawer header: avatar + name + "{goal} · {kcal}/day" subtitle + streak.
 *
 * Connected component — it reads `profile` straight from the auth store rather than
 * taking it via props, so it re-renders automatically whenever the profile changes
 * (e.g. after onboarding sets calorie_goal). All numbers shown are live data.
 */

// DB `goal` enum → human wording used in the Claude design ("Losing weight").
const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Losing weight',
  gain_weight: 'Gaining weight',
  maintain: 'Maintaining weight',
  build_muscle: 'Building muscle',
};

export default function ProfileHeaderCard() {
  const profile = useAuthStore((s) => s.profile);
  const streak = useStreak() ?? 0;

  const name = profile?.full_name?.trim() || 'STEADY user';
  const initial = name.charAt(0).toUpperCase();

  const goalLabel = profile?.goal ? GOAL_LABELS[profile.goal] ?? null : null;
  const kcal = profile?.calorie_goal ?? null;
  const subtitle = [goalLabel, kcal ? `${kcal.toLocaleString()} kcal/day` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      {/* Avatar: image if available, else initials fallback */}
      {profile?.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {subtitle.length > 0 && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}

        <View style={styles.streakRow}>
          <View style={styles.streakPill}>
            <Ionicons name="flame-outline" size={13} color={C.accent} />
            <Text style={styles.streakText}>{streak} day streak</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    // shadowWarmLg from the theme file (only place these live)
    shadowColor: colors.shadowWarmLg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '600',
    color: C.accent,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
  },
  subtitle: {
    fontSize: 12.5,
    color: C.text2,
    marginTop: 2,
    marginBottom: 6,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  streakPill: {
    height: 23,
    paddingHorizontal: 9,
    borderRadius: 20,
    backgroundColor: C.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.accent,
  },
});
