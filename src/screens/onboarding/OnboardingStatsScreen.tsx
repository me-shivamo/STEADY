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

/** What gets persisted to `profiles.units_system` and read by the rest of the app. */
type UnitSystem = 'metric' | 'imperial';

/** The two stat-entry combos this screen offers. Not a clean metric/imperial split. */
type Pairing = 'ftin_kg' | 'cm_lbs';

const KG_TO_LBS = 2.20462;
const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

// 170 → 5'7". Rounds to whole inches *first* and then splits, so the inches
// part is always 0–11 and can never land on a nonsensical 12. The old
// `(cm / 30.48).toFixed(1)` printed decimal feet instead — "5.6 ft" looks like
// 5 ft 6 in but actually means 5 ft 6.9 in, and could only ever show .0–.9,
// so it never covered all twelve inches in a foot.
function formatFeetInches(cm: number): string {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return `${Math.floor(totalInches / INCHES_PER_FOOT)}'${totalInches % INCHES_PER_FOOT}"`;
}

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
  const [pairing, setPairing] = useState<Pairing>('ftin_kg');
  const [ageIdx, setAgeIdx] = useState(DEFAULT_AGE_IDX);
  const [feetIdx, setFeetIdx] = useState(DEFAULT_FEET_IDX);
  const [inchesIdx, setInchesIdx] = useState(DEFAULT_INCHES_IDX);
  const [cmIdx, setCmIdx] = useState(DEFAULT_CM_IDX);
  const [weightKgIdx, setWeightKgIdx] = useState(DEFAULT_WEIGHT_KG_IDX);
  const [weightLbsIdx, setWeightLbsIdx] = useState(DEFAULT_WEIGHT_LBS_IDX);
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const age = AGES[ageIdx];
  const usesFeetInches = pairing === 'ftin_kg';
  const usesLbs = pairing === 'cm_lbs';

  // The screen offers *pairings* (ft/in with kg, cm with lbs) rather than the
  // traditional metric/imperial split, because "ft/in + kg" is how most people
  // here actually quote their stats. But `units_system` is a single flag, and
  // every other screen that reads it — WeightScreen, ProgressScreen,
  // HomeScreen, WaterScreen, Settings, and the very next onboarding step —
  // uses it to choose kg vs lbs. So it has to follow the *weight* unit picked
  // here. It used to follow the height unit, which meant choosing "kg" on this
  // screen showed you lbs on the target-weight screen one tap later.
  const unitsSystem: UnitSystem = usesLbs ? 'imperial' : 'metric';

  // Height is always stored/computed in cm regardless of which drum the user
  // is looking at — ft/in shows two wheels, cm shows a single one.
  const heightCm = usesFeetInches
    ? Math.round((FEET[feetIdx] * INCHES_PER_FOOT + INCHES[inchesIdx]) * CM_PER_INCH)
    : CM_HEIGHTS[cmIdx];

  // Weight is always stored in kg — the lbs drum is just a display/input
  // convenience, converted at the boundary.
  const weightKg = usesLbs
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
        units_system: unitsSystem,
      });
      posthog.capture('onboarding_step_completed', { step: 'stats', units: unitsSystem, pairing });
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
      <ChatBubble animated message="Got it! To calculate your calorie target I'll need a few quick details." />

      {/* Unit pairing toggle. Both labels read height-then-weight, in that
          order — they used to be listed in opposite orders ("cm · lbs" vs
          "kg · ft/in"), which made the pair look arbitrary. The default
          (ft/in · kg) sits first so the selected pill starts on the left. */}
      <View style={styles.unitToggle}>
        {(['ftin_kg', 'cm_lbs'] as Pairing[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.unitOption, pairing === p && styles.unitOptionActive]}
            onPress={() => setPairing(p)}
            activeOpacity={0.8}
          >
            <Text style={[styles.unitOptionText, pairing === p && styles.unitOptionTextActive]}>
              {p === 'ftin_kg' ? 'ft/in · kg' : 'cm · lbs'}
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
            {usesLbs ? (
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
              {usesFeetInches ? `${heightCm} cm` : formatFeetInches(heightCm)}
            </Text>
          </View>
          {usesFeetInches ? (
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
    // Deliberately not `flex: 1`. Growing to fill meant this block absorbed
    // every spare pixel on the screen, so the cards stayed pinned under the
    // chat bubble and all the slack piled up as dead space below the height
    // card. Sizing to content instead hands that slack back to the parent,
    // which is what lets the whole column be centred.
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
