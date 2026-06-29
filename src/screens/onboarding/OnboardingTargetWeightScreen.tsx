import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import DrumPicker from '../../components/common/DrumPicker';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { Chip } from '../../components/onboarding/SelectableCard';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

const WEIGHTS = Array.from({ length: 221 }, (_, i) => i + 30); // 30–250 kg

const DEADLINES: { label: string; months: number }[] = [
  { label: '1 month',  months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year',   months: 12 },
];

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

const DEFAULT_WEIGHT_IDX = 40; // 70 kg

type Props = { navigation: OnboardingNavProp };

export default function OnboardingTargetWeightScreen({ navigation }: Props) {
  const [weightIdx, setWeightIdx] = useState(DEFAULT_WEIGHT_IDX);
  const [deadlineMonths, setDeadlineMonths] = useState<number | null>(3);
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const goalWeightKg = WEIGHTS[weightIdx];

  const handleContinue = async () => {
    setLoading(true);
    try {
      await updateProfile({
        goal_weight_kg: goalWeightKg,
        deadline_date: deadlineMonths !== null ? addMonths(deadlineMonths) : null,
      });
      posthog.capture('onboarding_step_completed', { step: 'target_weight', skipped: false });
      navigation.navigate('OnboardingActivity');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await updateProfile({ goal_weight_kg: null, deadline_date: null });
      posthog.capture('onboarding_step_completed', { step: 'target_weight', skipped: true });
      navigation.navigate('OnboardingActivity');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      step={3}
      buttonLabel="Continue"
      onContinue={handleContinue}
      loading={loading}
      secondaryLabel="Not sure yet — skip"
      onSecondary={handleSkip}
    >
      <ChatBubble message="What's your target weight, and when do you want to reach it?" />

      <View style={styles.pickerCard}>
        <Text style={styles.pickerLabel}>Target weight</Text>
        <DrumPicker values={WEIGHTS} selectedIndex={weightIdx} onIndexChange={setWeightIdx} label="kg" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Timeline</Text>
        <View style={styles.chipsRow}>
          {DEADLINES.map((d) => (
            <Chip
              key={d.months}
              label={d.label}
              selected={deadlineMonths === d.months}
              onPress={() => setDeadlineMonths(d.months)}
            />
          ))}
        </View>
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  pickerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pickerLabel: { fontSize: typography.sm, fontWeight: '600', color: colors.textSecondary },
  section: { gap: spacing.sm, marginTop: spacing.lg },
  sectionLabel: { fontSize: typography.sm, fontWeight: '600', color: colors.textSecondary },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
