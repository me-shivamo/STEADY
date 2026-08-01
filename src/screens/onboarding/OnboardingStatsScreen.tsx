import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import DrumPicker from '../../components/common/DrumPicker';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { colors } from '../../theme/colors';
import { typography, fontFamily } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

type UnitSystem = 'metric' | 'imperial';

const KG_TO_LBS = 2.20462;

const AGES = Array.from({ length: 91 }, (_, i) => i + 10);       // 10–100
const FEET = Array.from({ length: 6 }, (_, i) => i + 3);          // 3–8 ft
const INCHES = Array.from({ length: 12 }, (_, i) => i);           // 0–11 in
const CM_HEIGHTS = Array.from({ length: 121 }, (_, i) => i + 120); // 120–240 cm
const WEIGHTS_KG = Array.from({ length: 221 }, (_, i) => i + 30); // 30–250 kg
const WEIGHTS_LBS = Array.from({ length: 421 }, (_, i) => i + 66); // 66–486 lbs

const DEFAULT_AGE_IDX = 15;      // 25 yrs
const DEFAULT_FEET_IDX = 2;      // 5 ft
const DEFAULT_INCHES_IDX = 7;    // 7 in → ~170 cm
const DEFAULT_CM_IDX = 50;       // 170 cm
const DEFAULT_WEIGHT_KG_IDX = 40;  // 70 kg
const DEFAULT_WEIGHT_LBS_IDX = 88; // ~154 lbs (≈70 kg)

type Props = { navigation: OnboardingNavProp };

export default function OnboardingStatsScreen({ navigation }: Props) {
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [ageIdx, setAgeIdx] = useState(DEFAULT_AGE_IDX);
  const [feetIdx, setFeetIdx] = useState(DEFAULT_FEET_IDX);
  const [inchesIdx, setInchesIdx] = useState(DEFAULT_INCHES_IDX);
  const [cmIdx, setCmIdx] = useState(DEFAULT_CM_IDX);
  const [weightKgIdx, setWeightKgIdx] = useState(DEFAULT_WEIGHT_KG_IDX);
  const [weightLbsIdx, setWeightLbsIdx] = useState(DEFAULT_WEIGHT_LBS_IDX);
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const age = AGES[ageIdx];
  // `units` now picks a *height* system (ft/in vs cm) — weight is paired the
  // opposite way round (kg goes with ft/in, lbs goes with cm), matching how
  // people actually think about their stats: "kg + ft/in" and "cm + lbs" are
  // the two combos users asked for, not the traditional metric/imperial split.
  const isImperialHeight = units === 'imperial';
  const isImperialWeight = !isImperialHeight;

  // Height is always stored/computed in cm regardless of which drum the user
  // is looking at — imperial shows ft+in, metric shows a single cm drum.
  const heightCm = isImperialHeight
    ? Math.round(FEET[feetIdx] * 30.48 + INCHES[inchesIdx] * 2.54)
    : CM_HEIGHTS[cmIdx];

  // Weight is always stored in kg — the lbs drum is just a display/input
  // convenience, converted at the boundary.
  const weightKg = isImperialWeight
    ? Math.round((WEIGHTS_LBS[weightLbsIdx] / KG_TO_LBS) * 10) / 10
    : WEIGHTS_KG[weightKgIdx];

  const dateOfBirth = `${new Date().getFullYear() - age}-01-01`;

  const handleContinue = async () => {
    setLoading(true);
    try {
      await updateProfile({
        date_of_birth: dateOfBirth,
        height_cm: heightCm,
        current_weight_kg: weightKg,
        units_system: units,
      });
      posthog.capture('onboarding_step_completed', { step: 'stats', units });
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

      {/* Metric / Imperial toggle */}
      <View style={styles.unitToggle}>
        {(['metric', 'imperial'] as UnitSystem[]).map((u) => (
          <TouchableOpacity
            key={u}
            style={[styles.unitOption, units === u && styles.unitOptionActive]}
            onPress={() => setUnits(u)}
            activeOpacity={0.8}
          >
            <Text style={[styles.unitOptionText, units === u && styles.unitOptionTextActive]}>
              {u === 'metric' ? 'cm · lbs' : 'kg · ft/in'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.pickersArea}>
        {/* Row 1: Age | Weight */}
        <View style={styles.pickerRow}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Age</Text>
            <DrumPicker values={AGES} selectedIndex={ageIdx} onIndexChange={setAgeIdx} label="yrs" />
          </View>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Weight</Text>
            {isImperialWeight ? (
              <DrumPicker values={WEIGHTS_LBS} selectedIndex={weightLbsIdx} onIndexChange={setWeightLbsIdx} label="lbs" />
            ) : (
              <DrumPicker values={WEIGHTS_KG} selectedIndex={weightKgIdx} onIndexChange={setWeightKgIdx} label="kg" />
            )}
          </View>
        </View>

        {/* Row 2: Height — ft+in (imperial) or a single cm drum (metric) */}
        <View style={[styles.pickerCard, styles.heightCard]}>
          <View style={styles.heightHeader}>
            <Text style={styles.pickerLabel}>Height</Text>
            <Text style={styles.heightCm}>
              {isImperialHeight ? `${heightCm} cm` : `${(heightCm / 30.48).toFixed(1)} ft`}
            </Text>
          </View>
          {isImperialHeight ? (
            <View style={styles.heightWheels}>
              <View style={styles.heightWheel}>
                <DrumPicker values={FEET} selectedIndex={feetIdx} onIndexChange={setFeetIdx} label="ft" />
              </View>
              <View style={styles.heightDivider} />
              <View style={styles.heightWheel}>
                <DrumPicker values={INCHES} selectedIndex={inchesIdx} onIndexChange={setInchesIdx} label="in" />
              </View>
            </View>
          ) : (
            <DrumPicker values={CM_HEIGHTS} selectedIndex={cmIdx} onIndexChange={setCmIdx} label="cm" />
          )}
        </View>
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: 3,
    marginTop: spacing.sm,
  },
  unitOption: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.md - 3,
    alignItems: 'center',
  },
  unitOptionActive: {
    backgroundColor: colors.bgCard,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  unitOptionText: {
    fontSize: typography.sm,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: colors.textMuted,
  },
  unitOptionTextActive: {
    color: colors.accent,
  },
  pickersArea: {
    flex: 1,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pickerCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: spacing.xs,
  },
  pickerLabel: {
    fontSize: typography.xs,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
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
    fontFamily: fontFamily.semibold,
  },
  heightWheels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heightWheel: {
    flex: 1,
  },
  // Divider spans the full picker height and is centred by the row's
  // alignItems: 'center', fixing the old short, slightly-high line.
  heightDivider: {
    width: 1,
    height: 110,
    backgroundColor: colors.border,
  },
});
