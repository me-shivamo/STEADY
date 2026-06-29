import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { Tables } from '../../types/database';

type Profile = Tables<'profiles'>;

// ── Small reusable pieces ─────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function RowDivider() {
  return <View style={styles.divider} />;
}

function SettingsRow({
  label,
  last = false,
  stacked = false,
  children,
}: {
  label: string;
  last?: boolean;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <View style={stacked ? styles.rowStacked : styles.row}>
        <Text style={stacked ? styles.rowLabelStacked : styles.rowLabel}>{label}</Text>
        <View style={stacked ? styles.rowRightStacked : styles.rowRight}>{children}</View>
      </View>
      {!last && <RowDivider />}
    </>
  );
}

function InlineInput({
  value,
  onChangeText,
  keyboardType = 'default',
  placeholder,
  unit,
  maxLength,
}: {
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  placeholder?: string;
  unit?: string;
  maxLength?: number;
}) {
  return (
    <View style={styles.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={C.muted}
        style={styles.inlineInput}
        maxLength={maxLength}
        returnKeyType="done"
      />
      {unit && <Text style={styles.unit}>{unit}</Text>}
    </View>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
  fullWidth = false,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <View style={[styles.segmented, fullWidth && styles.segmentedFull]}>
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.7}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, fullWidth && styles.segmentFull, on && styles.segmentActive]}
          >
            <Text numberOfLines={1} style={[styles.segmentText, on && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Option sets ───────────────────────────────────────────────────────────────

const SEX_OPTIONS      = [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }];
const GOAL_OPTIONS     = [{ label: 'Lose', value: 'lose_weight' }, { label: 'Maintain', value: 'maintain' }, { label: 'Gain', value: 'gain_weight' }, { label: 'Muscle', value: 'build_muscle' }];
const ACTIVITY_OPTIONS = [{ label: 'Sedentary', value: 'sedentary' }, { label: 'Light', value: 'lightly_active' }, { label: 'Moderate', value: 'moderately_active' }, { label: 'Active', value: 'very_active' }, { label: 'Very active', value: 'super_active' }];
const UNITS_OPTIONS    = [{ label: 'Metric', value: 'metric' }, { label: 'Imperial', value: 'imperial' }];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [saving, setSaving] = useState(false);

  const [name, setName]                 = useState('');
  const [sex, setSex]                   = useState('');
  const [heightCm, setHeightCm]         = useState('');
  const [weightKg, setWeightKg]         = useState('');
  const [goalWeightKg, setGoalWeightKg] = useState('');
  const [goal, setGoal]                 = useState('');
  const [activity, setActivity]         = useState('');
  const [calorieGoal, setCalorieGoal]   = useState('');
  const [proteinGoal, setProteinGoal]   = useState('');
  const [carbGoal, setCarbGoal]         = useState('');
  const [fatGoal, setFatGoal]           = useState('');
  const [units, setUnits]               = useState<'metric' | 'imperial'>('metric');

  // Populate from profile on mount
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name ?? '');
    setSex(profile.sex ?? '');
    setHeightCm(profile.height_cm != null ? String(profile.height_cm) : '');
    setWeightKg(profile.current_weight_kg != null ? String(profile.current_weight_kg) : '');
    setGoalWeightKg(profile.goal_weight_kg != null ? String(profile.goal_weight_kg) : '');
    setGoal(profile.goal ?? '');
    setActivity(profile.activity_level ?? '');
    setCalorieGoal(profile.calorie_goal != null ? String(profile.calorie_goal) : '');
    setProteinGoal(profile.protein_goal_g != null ? String(profile.protein_goal_g) : '');
    setCarbGoal(profile.carb_goal_g != null ? String(profile.carb_goal_g) : '');
    setFatGoal(profile.fat_goal_g != null ? String(profile.fat_goal_g) : '');
    setUnits((profile.units_system as 'metric' | 'imperial') ?? 'metric');
  }, [profile]);

  const toStoredHeight = (v: string): number | null => {
    const n = parseFloat(v);
    if (isNaN(n)) return null;
    return units === 'imperial' ? Math.round(n * 2.54) : n;
  };
  const toStoredWeight = (v: string): number | null => {
    const n = parseFloat(v);
    if (isNaN(n)) return null;
    return units === 'imperial' ? parseFloat((n * 0.453592).toFixed(1)) : n;
  };
  const toDisplayHeight = (cmVal: string): string => {
    const n = parseFloat(cmVal);
    if (isNaN(n)) return cmVal;
    return units === 'imperial' ? String(Math.round(n / 2.54)) : cmVal;
  };
  const toDisplayWeight = (kgVal: string): string => {
    const n = parseFloat(kgVal);
    if (isNaN(n)) return kgVal;
    return units === 'imperial' ? String(Math.round(n / 0.453592)) : kgVal;
  };

  const heightUnit = units === 'imperial' ? 'in' : 'cm';
  const weightUnit = units === 'imperial' ? 'lbs' : 'kg';

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updates: Partial<Profile> = {
        full_name:         name.trim() || null,
        sex:               (sex as Profile['sex']) || null,
        height_cm:         toStoredHeight(heightCm),
        current_weight_kg: toStoredWeight(weightKg),
        goal_weight_kg:    toStoredWeight(goalWeightKg),
        goal:              (goal as Profile['goal']) || null,
        activity_level:    (activity as Profile['activity_level']) || null,
        calorie_goal:      parseInt(calorieGoal) || null,
        protein_goal_g:    parseFloat(proteinGoal) || null,
        carb_goal_g:       parseFloat(carbGoal) || null,
        fat_goal_g:        parseFloat(fatGoal) || null,
        units_system:      units,
      };
      await updateProfile(updates);
      navigation.goBack();
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          activeOpacity={0.7}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── PROFILE ── */}
          <SectionLabel label="Profile" />
          <SettingsCard>
            <SettingsRow label="Name">
              <InlineInput value={name} onChangeText={setName} placeholder="Your name" maxLength={50} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Sex" last stacked>
              <SegmentedControl options={SEX_OPTIONS} value={sex} onChange={setSex} fullWidth />
            </SettingsRow>
          </SettingsCard>

          {/* ── BODY ── */}
          <SectionLabel label="Body" />
          <SettingsCard>
            <SettingsRow label={`Height (${heightUnit})`}>
              <InlineInput value={toDisplayHeight(heightCm)} onChangeText={setHeightCm} keyboardType="numeric" placeholder="—" maxLength={5} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label={`Current weight (${weightUnit})`}>
              <InlineInput value={toDisplayWeight(weightKg)} onChangeText={setWeightKg} keyboardType="decimal-pad" placeholder="—" maxLength={6} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label={`Goal weight (${weightUnit})`} last>
              <InlineInput value={toDisplayWeight(goalWeightKg)} onChangeText={setGoalWeightKg} keyboardType="decimal-pad" placeholder="—" maxLength={6} />
            </SettingsRow>
          </SettingsCard>

          {/* ── GOALS ── */}
          <SectionLabel label="Goals" />
          <SettingsCard>
            <SettingsRow label="Goal type" stacked>
              <SegmentedControl options={GOAL_OPTIONS} value={goal} onChange={setGoal} fullWidth />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Activity level" stacked>
              <SegmentedControl options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} fullWidth />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Daily calories">
              <InlineInput value={calorieGoal} onChangeText={setCalorieGoal} keyboardType="numeric" placeholder="—" unit="kcal" maxLength={5} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Protein">
              <InlineInput value={proteinGoal} onChangeText={setProteinGoal} keyboardType="numeric" placeholder="—" unit="g" maxLength={4} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Carbs">
              <InlineInput value={carbGoal} onChangeText={setCarbGoal} keyboardType="numeric" placeholder="—" unit="g" maxLength={4} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Fat" last>
              <InlineInput value={fatGoal} onChangeText={setFatGoal} keyboardType="numeric" placeholder="—" unit="g" maxLength={4} />
            </SettingsRow>
          </SettingsCard>

          {/* ── PREFERENCES ── */}
          <SectionLabel label="Preferences" />
          <SettingsCard>
            <SettingsRow label="Units" last stacked>
              <SegmentedControl options={UNITS_OPTIONS} value={units} onChange={(v) => setUnits(v as 'metric' | 'imperial')} fullWidth />
            </SettingsRow>
          </SettingsCard>

          <View style={{ height: 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
  },
  saveBtn: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Scroll
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },

  // Row — horizontal
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '400',
    color: C.text,
    flex: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },

  // Row — stacked
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  rowLabelStacked: {
    fontSize: 15,
    fontWeight: '400',
    color: C.text,
  },
  rowRightStacked: {
    alignItems: 'stretch',
  },

  divider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 14,
  },

  // Inline input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineInput: {
    fontSize: 15,
    fontWeight: '400',
    color: C.text,
    textAlign: 'right',
    minWidth: 44,
    paddingVertical: 0,
  },
  unit: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '400',
  },

  // Segmented control
  segmented: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  segmentedFull: { alignSelf: 'stretch' },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentFull: {
    flex: 1,
    paddingHorizontal: 4,
  },
  segmentActive: {
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: C.muted,
  },
  segmentTextActive: {
    color: C.accent,
    fontWeight: '600',
  },
});
