import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import DrumPicker from '../../components/common/DrumPicker';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { Chip } from '../../components/onboarding/SelectableCard';
import { colors } from '../../theme/colors';
import { typography, fontFamily } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';
import { toLocalDateString } from '../../utils/localDate';

type UnitSystem = 'metric' | 'imperial';
const KG_TO_LBS = 2.20462;

const WEIGHTS_KG = Array.from({ length: 221 }, (_, i) => i + 30); // 30–250 kg
const WEIGHTS_LBS = Array.from({ length: 421 }, (_, i) => i + 66); // 66–486 lbs

const DEADLINES: { label: string; months: number }[] = [
  { label: '1 month',  months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year',   months: 12 },
];

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return toLocalDateString(d);
}

const DEFAULT_WEIGHT_KG_IDX = 40;  // 70 kg
const DEFAULT_WEIGHT_LBS_IDX = 88; // ~154 lbs

type Props = { navigation: OnboardingNavProp };

export default function OnboardingTargetWeightScreen({ navigation }: Props) {
  const profileUnits = useAuthStore((s) => s.profile?.units_system) as UnitSystem | undefined;
  const units: UnitSystem = profileUnits ?? 'metric';
  const isImperial = units === 'imperial';

  const [weightKgIdx, setWeightKgIdx] = useState(DEFAULT_WEIGHT_KG_IDX);
  const [weightLbsIdx, setWeightLbsIdx] = useState(DEFAULT_WEIGHT_LBS_IDX);
  const [deadlineMonths, setDeadlineMonths] = useState<number | null>(3);
  const [customMonths, setCustomMonths] = useState('');
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();
  const customMonthsInputRef = useRef<TextInput>(null);

  const goalWeightKg = isImperial
    ? Math.round((WEIGHTS_LBS[weightLbsIdx] / KG_TO_LBS) * 10) / 10
    : WEIGHTS_KG[weightKgIdx];

  // Custom timeline: a free-typed month count overrides the preset chips.
  const customMonthsNum = parseInt(customMonths, 10);
  const effectiveMonths = customMonths.trim() && !isNaN(customMonthsNum) && customMonthsNum > 0
    ? customMonthsNum
    : deadlineMonths;

  const handleContinue = async () => {
    setLoading(true);
    try {
      await updateProfile({
        goal_weight_kg: goalWeightKg,
        deadline_date: effectiveMonths !== null ? addMonths(effectiveMonths) : null,
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
      secondaryLabel="Not sure yet, skip"
      onSecondary={handleSkip}
      scroll={false}
    >
      <ChatBubble animated message="What's your target weight, and when do you want to reach it?" />

      <View style={styles.pickerCard}>
        <Text style={styles.pickerLabel}>Target weight</Text>
        {isImperial ? (
          <DrumPicker values={WEIGHTS_LBS} selectedIndex={weightLbsIdx} onIndexChange={setWeightLbsIdx} label="lbs" />
        ) : (
          <DrumPicker values={WEIGHTS_KG} selectedIndex={weightKgIdx} onIndexChange={setWeightKgIdx} label="kg" />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Timeline</Text>
        <View style={styles.chipsRow}>
          {DEADLINES.map((d) => (
            <Chip
              key={d.months}
              label={d.label}
              selected={!customMonths.trim() && deadlineMonths === d.months}
              onPress={() => { setDeadlineMonths(d.months); setCustomMonths(''); }}
            />
          ))}
        </View>
        <View style={styles.customRow}>
          <Text style={styles.customLabel}>Or a custom timeline</Text>
          <Pressable
            style={styles.customInputWrap}
            onPress={() => customMonthsInputRef.current?.focus()}
          >
            <TextInput
              ref={customMonthsInputRef}
              style={styles.customInput}
              value={customMonths}
              onChangeText={setCustomMonths}
              placeholder="e.g. 4"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={3}
            />
            <Text style={styles.customInputSuffix}>months</Text>
          </Pressable>
        </View>
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  pickerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  pickerLabel: { fontSize: typography.sm, fontWeight: '600', fontFamily: fontFamily.semibold, color: colors.textSecondary },
  section: { gap: spacing.xs, marginTop: spacing.md },
  sectionLabel: { fontSize: typography.sm, fontWeight: '600', fontFamily: fontFamily.semibold, color: colors.textSecondary },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  customRow: { marginTop: spacing.xs, gap: spacing.xs },
  customLabel: { fontSize: typography.xs, color: colors.textMuted, fontFamily: fontFamily.regular },
  customInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 4,
    height: 44,
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  customInput: {
    fontSize: typography.md,
    color: colors.textPrimary,
    fontFamily: fontFamily.medium,
    minWidth: 40,
    padding: 0,
  },
  customInputSuffix: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontFamily: fontFamily.regular,
  },
});
