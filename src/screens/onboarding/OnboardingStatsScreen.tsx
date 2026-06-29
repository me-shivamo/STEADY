import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import DrumPicker from '../../components/common/DrumPicker';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

const AGES = Array.from({ length: 91 }, (_, i) => i + 10);       // 10–100
const FEET = Array.from({ length: 6 }, (_, i) => i + 3);          // 3–8 ft
const INCHES = Array.from({ length: 12 }, (_, i) => i);           // 0–11 in
const WEIGHTS = Array.from({ length: 221 }, (_, i) => i + 30);    // 30–250 kg

const DEFAULT_AGE_IDX = 15;     // 25 yrs
const DEFAULT_FEET_IDX = 2;     // 5 ft
const DEFAULT_INCHES_IDX = 7;   // 7 in → ~170 cm
const DEFAULT_WEIGHT_IDX = 40;  // 70 kg

type Props = { navigation: OnboardingNavProp };

export default function OnboardingStatsScreen({ navigation }: Props) {
  const [ageIdx, setAgeIdx] = useState(DEFAULT_AGE_IDX);
  const [feetIdx, setFeetIdx] = useState(DEFAULT_FEET_IDX);
  const [inchesIdx, setInchesIdx] = useState(DEFAULT_INCHES_IDX);
  const [weightIdx, setWeightIdx] = useState(DEFAULT_WEIGHT_IDX);
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const age = AGES[ageIdx];
  const feet = FEET[feetIdx];
  const inches = INCHES[inchesIdx];
  const weightKg = WEIGHTS[weightIdx];
  const heightCm = Math.round(feet * 30.48 + inches * 2.54);

  const dateOfBirth = `${new Date().getFullYear() - age}-01-01`;

  const handleContinue = async () => {
    setLoading(true);
    try {
      await updateProfile({
        date_of_birth: dateOfBirth,
        height_cm: heightCm,
        current_weight_kg: weightKg,
      });
      posthog.capture('onboarding_step_completed', { step: 'stats' });
      navigation.navigate('OnboardingTargetWeight');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      step={2}
      buttonLabel="Continue"
      onContinue={handleContinue}
      loading={loading}
      scroll={false}
    >
      <ChatBubble message="Got it! To calculate your calorie target I'll need a few quick details." />

      <View style={styles.pickersArea}>
        {/* Row 1: Age | Weight */}
        <View style={styles.pickerRow}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Age</Text>
            <DrumPicker values={AGES} selectedIndex={ageIdx} onIndexChange={setAgeIdx} label="yrs" />
          </View>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Weight</Text>
            <DrumPicker values={WEIGHTS} selectedIndex={weightIdx} onIndexChange={setWeightIdx} label="kg" />
          </View>
        </View>

        {/* Row 2: Height (ft + in side by side, with cm readout) */}
        <View style={[styles.pickerCard, styles.heightCard]}>
          <View style={styles.heightHeader}>
            <Text style={styles.pickerLabel}>Height</Text>
            <Text style={styles.heightCm}>{heightCm} cm</Text>
          </View>
          <View style={styles.heightWheels}>
            <View style={styles.heightWheel}>
              <DrumPicker values={FEET} selectedIndex={feetIdx} onIndexChange={setFeetIdx} label="ft" />
            </View>
            <View style={styles.heightDivider} />
            <View style={styles.heightWheel}>
              <DrumPicker values={INCHES} selectedIndex={inchesIdx} onIndexChange={setInchesIdx} label="in" />
            </View>
          </View>
        </View>
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  pickersArea: {
    flex: 1,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pickerCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  pickerLabel: {
    fontSize: typography.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heightCard: {
    flex: 0,
  },
  heightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heightCm: {
    fontSize: typography.xs,
    color: colors.accent,
    fontWeight: '600',
  },
  heightWheels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heightWheel: {
    flex: 1,
  },
  // Divider spans the full picker height and is centred by the row's
  // alignItems: 'center', fixing the old short, slightly-high line.
  heightDivider: {
    width: 1,
    height: 132,
    backgroundColor: colors.border,
  },
});
