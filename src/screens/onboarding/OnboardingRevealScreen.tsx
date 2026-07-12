import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { calculateTDEE, calculateAge, estimateWeeksToGoal, TDEEInput } from '../../utils/tdee';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

const GOAL_ADJUSTMENTS: Record<string, number> = {
  lose_weight: -500,
  gain_weight: 300,
  maintain: 0,
  build_muscle: 200,
};

export default function OnboardingRevealScreen() {
  const { profile, updateProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const animatedCalories = useRef(new Animated.Value(0)).current;
  const [displayCalories, setDisplayCalories] = useState(0);

  const result = (() => {
    if (
      !profile?.current_weight_kg ||
      !profile?.height_cm ||
      !profile?.date_of_birth ||
      !profile?.activity_level ||
      !profile?.goal
    ) return null;

    const age = calculateAge(profile.date_of_birth);
    const input: TDEEInput = {
      weight_kg: profile.current_weight_kg,
      height_cm: profile.height_cm,
      age,
      sex: (profile.sex as TDEEInput['sex']) ?? 'other',
      activity_level: profile.activity_level as TDEEInput['activity_level'],
      goal: profile.goal as TDEEInput['goal'],
    };
    return calculateTDEE(input);
  })();

  const weeksToGoal = (() => {
    if (!result || !profile?.current_weight_kg || !profile?.goal_weight_kg) return null;
    const adj = GOAL_ADJUSTMENTS[profile.goal ?? 'maintain'] ?? 0;
    if (adj === 0) return null;
    return estimateWeeksToGoal(profile.current_weight_kg, profile.goal_weight_kg, adj);
  })();

  useEffect(() => {
    if (!result) return;
    animatedCalories.setValue(0);
    const listener = animatedCalories.addListener(({ value }) => {
      setDisplayCalories(Math.round(value));
    });
    Animated.timing(animatedCalories, {
      toValue: result.calorieGoal,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    return () => animatedCalories.removeListener(listener);
  }, [result?.calorieGoal]);

  const handleStart = async () => {
    if (!result) return;
    setLoading(true);
    try {
      await updateProfile({
        calorie_goal: result.calorieGoal,
        protein_goal_g: result.proteinG,
        carb_goal_g: result.carbsG,
        fat_goal_g: result.fatG,
        onboarding_complete: true,
      });
      posthog.capture('onboarding_completed', {
        goal: profile?.goal ?? null,
        calorie_goal: result.calorieGoal,
        diet_type: profile?.dietary_restrictions ?? null,
        activity_level: profile?.activity_level ?? null,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!result) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Crunching the numbers…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <OnboardingScreen
      step={6}
      buttonLabel="Let's start! →"
      onContinue={handleStart}
      loading={loading}
    >
      <ChatBubble message="Here's your personalised daily plan:" />

      <View style={styles.calorieCard}>
        <Text style={styles.calorieNumber}>{displayCalories.toLocaleString()}</Text>
        <Text style={styles.calorieUnit}>kcal / day</Text>

        <View style={styles.macroRow}>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.protein }]}>{result.proteinG}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={styles.macroDivider} />
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.carbs }]}>{result.carbsG}g</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
          <View style={styles.macroDivider} />
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.fat }]}>{result.fatG}g</Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
        </View>
      </View>

      {weeksToGoal !== null && (
        <View style={styles.paceCard}>
          <Text style={styles.paceText}>
            At this pace you'll reach your goal in{' '}
            <Text style={styles.paceHighlight}>~{weeksToGoal} weeks</Text>
          </Text>
        </View>
      )}

      {profile?.goal === 'maintain' && (
        <View style={styles.paceCard}>
          <Text style={styles.paceText}>You're eating to maintain — no deficit needed.</Text>
        </View>
      )}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  loadingText: { color: colors.textMuted, fontSize: typography.md },
  calorieCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  calorieNumber: {
    fontSize: 64,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: -2,
  },
  calorieUnit: {
    fontSize: typography.md,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: -spacing.md,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    width: '100%',
    justifyContent: 'space-around',
  },
  macroItem: { alignItems: 'center', gap: 2 },
  macroValue: { fontSize: typography.xl, fontWeight: '700' },
  macroLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: '500' },
  macroDivider: { width: 1, height: 32, backgroundColor: colors.border },
  paceCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  paceText: { fontSize: typography.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  paceHighlight: { fontWeight: '700', color: colors.accent },
});
