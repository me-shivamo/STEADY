import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { useAuthStore } from '../../store/authStore';
import { useWeightStore } from '../../store/weightStore';
import { Tables } from '../../types/database';
import { PRIVACY_URL, TERMS_URL } from '../../constants/legal';
import { AppStackNavProp } from '../../navigation/types';
import { calculateTDEE, calculateAge, TDEEInput, TDEEResult } from '../../utils/tdee';
import {
  UnitSystem,
  weightUnitLabel,
  heightUnitLabel,
  formatWeight,
  formatHeight,
  parseWeight,
  parseHeight,
  convertWeightText,
  convertHeightText,
  ageToDateOfBirth,
  monthsFromToday,
  formatDateLabel,
} from '../../utils/units';

type Profile = Tables<'profiles'>;

// ── Option sets ───────────────────────────────────────────────────────────────

const SEX_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];
const GOAL_OPTIONS = [
  { label: 'Lose weight', value: 'lose_weight' },
  { label: 'Maintain', value: 'maintain' },
  { label: 'Gain weight', value: 'gain_weight' },
  { label: 'Build muscle', value: 'build_muscle' },
];
const ACTIVITY_OPTIONS = [
  { label: 'Sedentary', value: 'sedentary' },
  { label: 'Light', value: 'lightly_active' },
  { label: 'Moderate', value: 'moderately_active' },
  { label: 'Active', value: 'very_active' },
  { label: 'Very active', value: 'super_active' },
];
// The design's own wording for the units segment ("kg, cm" / "lb, ft").
const UNITS_OPTIONS: { label: string; value: UnitSystem }[] = [
  { label: 'kg, cm', value: 'metric' },
  { label: 'lb, in', value: 'imperial' },
];
const DEADLINE_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'No deadline', value: null },
  { label: '1 month', value: 1 },
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '1 year', value: 12 },
];

// ── Building blocks ───────────────────────────────────────────────────────────
//
// Styling tokens come from the Claude Design settings screen
// (steady-screens-settings.jsx): one *neutral* icon tile per row ("restrained
// palette — accent used sparingly"), 18px card radius with 16px inner padding,
// dividers spanning the card's full inner width, 15/600 labels, and 12.5 muted
// subtitles that ellipsize on one line instead of wrapping. The screen itself
// stays what it already is — a single editable form, not the design's
// drill-in menu.

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** Icon tile + label (+ optional one-line sub). Shared by both row shapes. */
function RowHead({
  icon,
  label,
  sub,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <>
      <View style={[styles.tile, danger && styles.tileDanger]}>
        <Ionicons name={icon} size={17} color={danger ? colors.error : C.text2} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={1} ellipsizeMode="tail">
            {sub}
          </Text>
        ) : null}
      </View>
    </>
  );
}

/** A row whose control sits on the right: a value field, a segment, a chevron. */
function Row({
  icon,
  label,
  sub,
  last = false,
  danger = false,
  onPress,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  last?: boolean;
  danger?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const body = (
    <View style={[styles.row, !last && styles.divider]}>
      <RowHead icon={icon} label={label} sub={sub} danger={danger} />
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
      {body}
    </TouchableOpacity>
  );
}

/** A row whose control is a grid, so it sits below and aligns under the label. */
function GridRow({
  icon,
  label,
  sub,
  last = false,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.gridRowWrap, !last && styles.divider]}>
      <View style={styles.gridRowHead}>
        <RowHead icon={icon} label={label} sub={sub} />
      </View>
      <View style={styles.gridRowBody}>{children}</View>
    </View>
  );
}

/**
 * Even choice grid — the fix for the ragged chip rows.
 *
 * Chips sized by their own text wrap unevenly (4 options land 3 + 1, 5 land
 * 3 + 2 at different widths), which is what made the card look lopsided. Here
 * every cell is `flexBasis: 0, flexGrow: 1`, so a row of N cells always splits
 * the available width into N identical columns, and short rows are padded with
 * invisible spacers so the columns still line up top to bottom. Same idea as a
 * fixed-column CSS grid rather than a flex-wrap.
 */
function ChoiceGrid<T extends string | number | null>({
  options,
  value,
  onChange,
  columns,
}: {
  options: { label: string; value: T }[];
  value: T | undefined;
  onChange: (v: T) => void;
  columns: number;
}) {
  const rows: { label: string; value: T }[][] = [];
  for (let i = 0; i < options.length; i += columns) rows.push(options.slice(i, i + columns));

  return (
    <View style={styles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.gridLine}>
          {row.map((opt) => {
            const on = value === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                activeOpacity={0.75}
                onPress={() => onChange(opt.value)}
                style={[styles.cell, on && styles.cellOn]}
              >
                <Text style={[styles.cellText, on && styles.cellTextOn]} numberOfLines={1}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {/* Keep the last row's columns aligned with the rows above it. */}
          {Array.from({ length: columns - row.length }).map((_, k) => (
            <View key={`spacer-${k}`} style={styles.cellSpacer} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Compact segmented control for short choice sets, sitting on the right. */
function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.75}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentBtn, on && styles.segmentBtnOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Fixed-width editable value, so every right-hand control lines up exactly.
 *
 * The whole pill is the tap target, not just the text. A bare <TextInput>
 * inside a <View> only takes focus when you hit the glyphs themselves — the
 * padding and the unit suffix ("kg", "yrs") swallow the tap and nothing
 * happens, which reads as a dead control. Wrapping it in a Pressable that
 * forwards focus to the input via a ref fixes that, and hitSlop extends the
 * target a few px past the pill for good measure. Same pattern the onboarding
 * target-weight screen already uses for its custom-months field.
 *
 * The unit label needs `pointerEvents="none"` on top of that. A <Text> can
 * become the touch responder in its own right, and when it does the tap stops
 * there instead of bubbling to the Pressable's onPress — so tapping exactly on
 * "kg" would still do nothing even though the rest of the pill worked. Marking
 * it non-interactive makes the touch fall through to the wrapper every time.
 */
function Field({
  value,
  onChangeText,
  unit,
  keyboardType = 'numeric',
  maxLength,
  placeholder = '—',
  wide = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  unit?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  maxLength?: number;
  placeholder?: string;
  wide?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  return (
    <Pressable
      style={[styles.field, wide && styles.fieldWide]}
      onPress={() => inputRef.current?.focus()}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        style={styles.fieldInput}
        maxLength={maxLength}
        selectTextOnFocus
        returnKeyType="done"
      />
      {unit ? (
        <Text style={styles.fieldUnit} pointerEvents="none">
          {unit}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toInt(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation<AppStackNavProp>();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const addWeightEntry = useWeightStore((s) => s.addEntry);

  const [saving, setSaving] = useState(false);
  const [saveErrorText, setSaveErrorText] = useState<string | null>(null);

  // Draft state. Every measurement here is a *display-unit string* — see
  // utils/units.ts for why the canonical kg/cm values only exist at the edges.
  const [name, setName] = useState('');
  const [sex, setSex] = useState('');
  const [ageText, setAgeText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [weightText, setWeightText] = useState('');
  const [goalWeightText, setGoalWeightText] = useState('');
  const [goal, setGoal] = useState('');
  const [activity, setActivity] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [deadlineChoice, setDeadlineChoice] = useState<number | null | 'existing'>('existing');
  const [calorieText, setCalorieText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [carbText, setCarbText] = useState('');
  const [fatText, setFatText] = useState('');
  const [units, setUnits] = useState<UnitSystem>('metric');

  // True once the user hand-edits any of the four daily targets. A manual
  // number always beats a recalculated one, so this suppresses the recalc
  // prompt entirely for the rest of the session.
  const [targetsTouched, setTargetsTouched] = useState(false);

  // The display text we hydrated with. Comparing against it lets us tell
  // "untouched" apart from "retyped to the same value" — untouched fields keep
  // their exact stored canonical number instead of being round-tripped through
  // a rounded display value (70kg → 154lb → 69.9kg would otherwise look like
  // a weight change and log a bogus weigh-in).
  const initialText = useRef({ height: '', weight: '', goalWeight: '' });

  // Hydrate once per user. Re-running this on every `profile` change would let
  // the background timezone sync in authStore.fetchProfile wipe whatever you
  // were halfway through typing.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || hydratedFor.current === profile.id) return;
    hydratedFor.current = profile.id;

    const u = (profile.units_system as UnitSystem) ?? 'metric';
    const h = formatHeight(profile.height_cm, u);
    const w = formatWeight(profile.current_weight_kg, u);
    const gw = formatWeight(profile.goal_weight_kg, u);

    setUnits(u);
    setName(profile.full_name ?? '');
    setSex(profile.sex ?? '');
    setAgeText(profile.date_of_birth ? String(calculateAge(profile.date_of_birth)) : '');
    setHeightText(h);
    setWeightText(w);
    setGoalWeightText(gw);
    setGoal(profile.goal ?? '');
    setActivity(profile.activity_level ?? '');
    setDeadline(profile.deadline_date ?? null);
    setDeadlineChoice('existing');
    setCalorieText(profile.calorie_goal != null ? String(profile.calorie_goal) : '');
    setProteinText(profile.protein_goal_g != null ? String(profile.protein_goal_g) : '');
    setCarbText(profile.carb_goal_g != null ? String(profile.carb_goal_g) : '');
    setFatText(profile.fat_goal_g != null ? String(profile.fat_goal_g) : '');

    initialText.current = { height: h, weight: w, goalWeight: gw };
  }, [profile]);

  // Flipping the units segment converts what's on screen instead of
  // reinterpreting it. 154 lb becomes 70 kg — it does not become 154 kg.
  //
  // A field the user hasn't touched is re-formatted from the stored canonical
  // number instead of from the rounded text on screen, so metric → imperial →
  // metric lands back on exactly 65 kg. Going through the text would give 64.9
  // (65 kg displays as 143 lb, but 143 lb is really 64.9 kg) and each flip
  // would shave a little more off a number the user never edited.
  const changeUnits = (next: UnitSystem) => {
    if (next === units) return;
    const init = initialText.current;

    setHeightText((t) =>
      t === init.height ? formatHeight(profile?.height_cm, next) : convertHeightText(t, units, next)
    );
    setWeightText((t) =>
      t === init.weight ? formatWeight(profile?.current_weight_kg, next) : convertWeightText(t, units, next)
    );
    setGoalWeightText((t) =>
      t === init.goalWeight ? formatWeight(profile?.goal_weight_kg, next) : convertWeightText(t, units, next)
    );

    // "Untouched" always means "what the stored value looks like in the units
    // currently on screen", so it is recomputed from the profile, never
    // converted forward from the previous string.
    initialText.current = {
      height: formatHeight(profile?.height_cm, next),
      weight: formatWeight(profile?.current_weight_kg, next),
      goalWeight: formatWeight(profile?.goal_weight_kg, next),
    };
    setUnits(next);
  };

  // ── Draft → canonical ──────────────────────────────────────────────────────
  const heightCm =
    heightText === initialText.current.height ? profile?.height_cm ?? null : parseHeight(heightText, units);
  const weightKg =
    weightText === initialText.current.weight ? profile?.current_weight_kg ?? null : parseWeight(weightText, units);
  const goalWeightKg =
    goalWeightText === initialText.current.goalWeight
      ? profile?.goal_weight_kg ?? null
      : parseWeight(goalWeightText, units);

  const ageNum = (() => {
    const n = parseInt(ageText, 10);
    return Number.isFinite(n) && n >= 10 && n <= 100 ? n : null;
  })();
  const profileAge = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;

  // ── Live TDEE recalculation ────────────────────────────────────────────────
  const recomputed: TDEEResult | null = useMemo(() => {
    if (weightKg == null || heightCm == null || ageNum == null || !activity || !goal) return null;
    const input: TDEEInput = {
      weight_kg: weightKg,
      height_cm: heightCm,
      age: ageNum,
      sex: (sex as TDEEInput['sex']) || 'other',
      activity_level: activity as TDEEInput['activity_level'],
      goal: goal as TDEEInput['goal'],
      goal_weight_kg: goalWeightKg,
      deadline_date: deadline,
    };
    return calculateTDEE(input);
  }, [weightKg, heightCm, ageNum, sex, activity, goal, goalWeightKg, deadline]);

  const tdeeInputsChanged =
    heightCm !== (profile?.height_cm ?? null) ||
    weightKg !== (profile?.current_weight_kg ?? null) ||
    goalWeightKg !== (profile?.goal_weight_kg ?? null) ||
    ageNum !== profileAge ||
    sex !== (profile?.sex ?? '') ||
    activity !== (profile?.activity_level ?? '') ||
    goal !== (profile?.goal ?? '') ||
    deadline !== (profile?.deadline_date ?? null);

  const targetsDiffer =
    recomputed != null &&
    (recomputed.calorieGoal !== toInt(calorieText) ||
      recomputed.proteinG !== toInt(proteinText) ||
      recomputed.carbsG !== toInt(carbText) ||
      recomputed.fatG !== toInt(fatText));

  const shouldOfferRecalc = !targetsTouched && tdeeInputsChanged && targetsDiffer;

  const isDirty =
    tdeeInputsChanged ||
    name.trim() !== (profile?.full_name ?? '').trim() ||
    units !== ((profile?.units_system as UnitSystem) ?? 'metric') ||
    toInt(calorieText) !== (profile?.calorie_goal ?? null) ||
    toInt(proteinText) !== (profile?.protein_goal_g ?? null) ||
    toInt(carbText) !== (profile?.carb_goal_g ?? null) ||
    toInt(fatText) !== (profile?.fat_goal_g ?? null);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [showRecalc, setShowRecalc] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const pendingLeave = useRef<any>(null);
  const allowLeave = useRef(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErrorText, setDeleteErrorText] = useState<string | null>(null);

  // Intercept the hardware/gesture back so a half-filled form isn't silently
  // thrown away. `beforeRemove` fires for every way this screen can be popped.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty || allowLeave.current || saving) return;
      e.preventDefault();
      pendingLeave.current = e.data.action;
      setShowDiscard(true);
    });
    return unsub;
  }, [navigation, isDirty, saving]);

  const leaveWithoutSaving = () => {
    allowLeave.current = true;
    setShowDiscard(false);
    if (pendingLeave.current) navigation.dispatch(pendingLeave.current);
    else navigation.goBack();
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const applyRecalculated = () => {
    if (!recomputed) return;
    setCalorieText(String(recomputed.calorieGoal));
    setProteinText(String(recomputed.proteinG));
    setCarbText(String(recomputed.carbsG));
    setFatText(String(recomputed.fatG));
  };

  const handleSave = () => {
    if (saving) return;
    if (shouldOfferRecalc) {
      setShowRecalc(true);
      return;
    }
    commit(false);
  };

  const commit = async (useRecalculated: boolean) => {
    setShowRecalc(false);
    setSaveErrorText(null);
    setSaving(true);
    try {
      const targets =
        useRecalculated && recomputed
          ? {
              calorie_goal: recomputed.calorieGoal,
              protein_goal_g: recomputed.proteinG,
              carb_goal_g: recomputed.carbsG,
              fat_goal_g: recomputed.fatG,
            }
          : {
              calorie_goal: toInt(calorieText),
              protein_goal_g: toInt(proteinText),
              carb_goal_g: toInt(carbText),
              fat_goal_g: toInt(fatText),
            };

      const updates: Partial<Profile> = {
        full_name: name.trim() || null,
        sex: (sex as Profile['sex']) || null,
        height_cm: heightCm,
        current_weight_kg: weightKg,
        goal_weight_kg: goalWeightKg,
        deadline_date: deadline,
        goal: (goal as Profile['goal']) || null,
        activity_level: (activity as Profile['activity_level']) || null,
        units_system: units,
        ...targets,
      };

      // Only touch date_of_birth when a valid age was entered — an empty or
      // out-of-range field must not wipe a real birth date off the profile.
      if (ageNum != null && ageNum !== profileAge) {
        updates.date_of_birth = ageToDateOfBirth(ageNum, profile?.date_of_birth);
      }

      await updateProfile(updates);

      // Two-way weight sync. weightStore.addEntry() upserts today's row in
      // weight_logs (and re-writes the profile column itself), so a weight
      // changed here now shows up on the Weight screen, the Progress chart and
      // the adaptive TDEE estimator.
      if (weightKg != null && weightKg !== (profile?.current_weight_kg ?? null)) {
        await addWeightEntry(weightKg);
      }

      allowLeave.current = true;
      navigation.goBack();
    } catch {
      setSaveErrorText('Could not save. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete account ─────────────────────────────────────────────────────────

  const openDeleteModal = () => {
    setDeleteConfirmText('');
    setDeleteErrorText(null);
    setShowDeleteModal(true);
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleteErrorText(null);
    setDeleting(true);
    try {
      allowLeave.current = true;
      await deleteAccount();
      // No navigation needed: the session becomes null, so RootNavigator
      // unmounts the whole app stack and shows the welcome screen.
    } catch {
      allowLeave.current = false;
      setDeleting(false);
      setDeleteErrorText('Could not delete account. Please check your connection and try again.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const wUnit = weightUnitLabel(units);
  const hUnit = heightUnitLabel(units);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header — left-aligned title, borderless, per the design */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, (saving || !isDirty) && styles.saveBtnDisabled]}
          activeOpacity={0.8}
          disabled={saving || !isDirty}
        >
          {saving ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Text style={[styles.saveBtnText, !isDirty && styles.saveBtnTextDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {saveErrorText ? <Text style={styles.inlineError}>{saveErrorText}</Text> : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Live plan summary ── */}
          <View style={styles.planCard}>
            <View style={styles.planTop}>
              <View style={styles.rowText}>
                <Text style={styles.planLabel}>Daily plan</Text>
                <View style={styles.planNumberRow}>
                  <Text style={styles.planNumber}>{toInt(calorieText)?.toLocaleString() ?? '—'}</Text>
                  <Text style={styles.planUnit}>kcal</Text>
                </View>
              </View>
              <View style={styles.planMacros}>
                <PlanMacro label="Protein" value={toInt(proteinText)} color={C.protein} />
                <PlanMacro label="Carbs" value={toInt(carbText)} color={C.carbs} />
                <PlanMacro label="Fat" value={toInt(fatText)} color={C.fat} />
              </View>
            </View>
            {shouldOfferRecalc && recomputed ? (
              <TouchableOpacity style={styles.planNotice} onPress={applyRecalculated} activeOpacity={0.75}>
                <Ionicons name="sparkles-outline" size={13} color={C.accent} />
                <Text style={styles.planNoticeText} numberOfLines={1}>
                  Stats changed — {recomputed.calorieGoal.toLocaleString()} kcal fits better
                </Text>
                <Text style={styles.planNoticeLink}>Update</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── PROFILE ── */}
          <SectionLabel label="Profile" />
          <Card>
            <Row icon="person-outline" label="Name">
              <Field value={name} onChangeText={setName} placeholder="Your name" maxLength={50} wide />
            </Row>
            <Row icon="calendar-outline" label="Age">
              <Field value={ageText} onChangeText={setAgeText} unit="yrs" maxLength={3} />
            </Row>
            <Row icon="male-female-outline" label="Sex" last>
              <Segment options={SEX_OPTIONS} value={sex} onChange={setSex} />
            </Row>
          </Card>

          {/* ── BODY ── */}
          <SectionLabel label="Body" />
          <Card>
            <Row icon="resize-outline" label="Height">
              <Field value={heightText} onChangeText={setHeightText} unit={hUnit} maxLength={5} />
            </Row>
            <Row icon="scale-outline" label="Current weight" sub="Logs to your weight history">
              <Field
                value={weightText}
                onChangeText={setWeightText}
                unit={wUnit}
                keyboardType="decimal-pad"
                maxLength={6}
              />
            </Row>
            <Row icon="trophy-outline" label="Goal weight" last>
              <Field
                value={goalWeightText}
                onChangeText={setGoalWeightText}
                unit={wUnit}
                keyboardType="decimal-pad"
                maxLength={6}
              />
            </Row>
          </Card>

          {/* ── GOALS ── */}
          <SectionLabel label="Goals" />
          <Card>
            <GridRow icon="flag-outline" label="What you're working on">
              <ChoiceGrid options={GOAL_OPTIONS} value={goal} onChange={setGoal} columns={2} />
            </GridRow>
            <GridRow icon="flash-outline" label="Activity level">
              <ChoiceGrid options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} columns={3} />
            </GridRow>
            <GridRow
              icon="calendar-clear-outline"
              label="Target date"
              sub={formatDateLabel(deadline) ? `Aiming for ${formatDateLabel(deadline)}` : 'No deadline set'}
              last
            >
              <ChoiceGrid
                options={DEADLINE_OPTIONS}
                value={deadlineChoice === 'existing' ? undefined : deadlineChoice}
                onChange={(months) => {
                  setDeadlineChoice(months);
                  setDeadline(months == null ? null : monthsFromToday(months));
                }}
                columns={3}
              />
            </GridRow>
          </Card>

          {/* ── DAILY TARGETS ── */}
          <SectionLabel label="Daily targets" />
          <Card>
            <Row icon="flame-outline" label="Calories">
              <Field
                value={calorieText}
                onChangeText={(v) => {
                  setCalorieText(v);
                  setTargetsTouched(true);
                }}
                unit="kcal"
                maxLength={5}
              />
            </Row>
            <Row icon="nutrition-outline" label="Protein">
              <Field
                value={proteinText}
                onChangeText={(v) => {
                  setProteinText(v);
                  setTargetsTouched(true);
                }}
                unit="g"
                maxLength={4}
              />
            </Row>
            <Row icon="leaf-outline" label="Carbs">
              <Field
                value={carbText}
                onChangeText={(v) => {
                  setCarbText(v);
                  setTargetsTouched(true);
                }}
                unit="g"
                maxLength={4}
              />
            </Row>
            <Row icon="water-outline" label="Fat">
              <Field
                value={fatText}
                onChangeText={(v) => {
                  setFatText(v);
                  setTargetsTouched(true);
                }}
                unit="g"
                maxLength={4}
              />
            </Row>
            <Row
              icon="refresh-outline"
              label="Recalculate from my stats"
              sub={
                recomputed
                  ? `${recomputed.calorieGoal.toLocaleString()} kcal · ${recomputed.proteinG}P / ${recomputed.carbsG}C / ${recomputed.fatG}F`
                  : 'Add your age, height, weight, activity and goal'
              }
              last
              onPress={recomputed ? applyRecalculated : undefined}
            >
              {recomputed ? <Ionicons name="chevron-forward" size={15} color={C.accent} /> : null}
            </Row>
          </Card>

          {/* ── PREFERENCES ── */}
          <SectionLabel label="Preferences" />
          <Card>
            <Row icon="swap-horizontal-outline" label="Units" last>
              <Segment options={UNITS_OPTIONS} value={units} onChange={changeUnits} />
            </Row>
          </Card>

          {/* ── ABOUT ── */}
          {/* Play's health-apps policy requires the privacy policy to be
              reachable inside the app, not just on the store listing. */}
          <SectionLabel label="About" />
          <Card>
            <Row
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              onPress={() => Linking.openURL(PRIVACY_URL)}
            >
              <Ionicons name="open-outline" size={15} color={C.muted} />
            </Row>
            <Row
              icon="document-text-outline"
              label="Terms of Service"
              last
              onPress={() => Linking.openURL(TERMS_URL)}
            >
              <Ionicons name="open-outline" size={15} color={C.muted} />
            </Row>
          </Card>

          {/* ── ACCOUNT ── */}
          <SectionLabel label="Account" />
          <Card>
            <Row icon="trash-outline" label="Delete account" danger last onPress={openDeleteModal}>
              <Ionicons name="chevron-forward" size={15} color={colors.error} />
            </Row>
          </Card>

          <View style={{ height: 12 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Recalculation preview ── */}
      <Modal visible={showRecalc} transparent animationType="fade" onRequestClose={() => setShowRecalc(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowRecalc(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetHeading}>Update your daily targets?</Text>
            <Text style={styles.sheetBody}>
              Your stats changed, so the numbers behind your plan have moved too.
            </Text>

            {recomputed ? (
              <View style={styles.compareCard}>
                <CompareRow label="Calories" from={toInt(calorieText)} to={recomputed.calorieGoal} unit=" kcal" />
                <CompareRow label="Protein" from={toInt(proteinText)} to={recomputed.proteinG} unit="g" />
                <CompareRow label="Carbs" from={toInt(carbText)} to={recomputed.carbsG} unit="g" />
                <CompareRow label="Fat" from={toInt(fatText)} to={recomputed.fatG} unit="g" last />
              </View>
            ) : null}

            <View style={styles.sheetButtons}>
              <TouchableOpacity style={styles.sheetSecondary} onPress={() => commit(false)} activeOpacity={0.8}>
                <Text style={styles.sheetSecondaryText}>Keep mine</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetPrimary} onPress={() => commit(true)} activeOpacity={0.85}>
                <Text style={styles.sheetPrimaryText}>Update targets</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Unsaved-changes guard ── */}
      <Modal visible={showDiscard} transparent animationType="fade" onRequestClose={() => setShowDiscard(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDiscard(false)}>
          <Pressable style={styles.modalPanel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Discard changes?</Text>
            <Text style={styles.modalBody}>You've edited a few things that haven't been saved yet.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={leaveWithoutSaving} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetPrimary}
                onPress={() => {
                  setShowDiscard(false);
                  handleSave();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.sheetPrimaryText}>Keep editing</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete-account confirmation ── */}
      {/* RN's Alert.prompt is iOS-only, so the type-DELETE confirmation lives
          in a cross-platform Modal instead. */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setShowDeleteModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => !deleting && setShowDeleteModal(false)}>
          <Pressable style={styles.modalPanel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>
              This permanently erases your profile, meal logs, photos, weight and water history,
              everything. It cannot be undone.
            </Text>
            <Text style={styles.modalHint}>Type DELETE to confirm</Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={C.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.modalInput}
              editable={!deleting}
            />
            {deleteErrorText ? <Text style={styles.inlineError}>{deleteErrorText}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalDeleteBtn,
                  (deleteConfirmText !== 'DELETE' || deleting) && styles.modalDeleteBtnDisabled,
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlanMacro({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <View style={styles.planMacro}>
      <View style={[styles.planDot, { backgroundColor: color }]} />
      <Text style={styles.planMacroValue}>{value != null ? `${value}g` : '—'}</Text>
      <Text style={styles.planMacroLabel}>{label}</Text>
    </View>
  );
}

function CompareRow({
  label,
  from,
  to,
  unit,
  last = false,
}: {
  label: string;
  from: number | null;
  to: number;
  unit: string;
  last?: boolean;
}) {
  const changed = from !== to;
  return (
    <View style={[styles.compareRow, !last && styles.divider]}>
      <Text style={styles.compareLabel}>{label}</Text>
      <Text style={styles.compareFrom}>
        {from != null ? from.toLocaleString() : '—'}
        {unit}
      </Text>
      <Ionicons name="arrow-forward" size={12} color={C.muted} />
      <Text style={[styles.compareTo, !changed && styles.compareToSame]}>
        {to.toLocaleString()}
        {unit}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
//
// Tokens mirror the Claude Design settings screen: 18px card radius with 16px
// inner padding, 38px *neutral* icon tiles at radius 11, 15/600 labels, 12
// muted single-line subs, and dividers that span the card's full inner width.

// Compact rhythm. TILE drives the row height (it's the tallest thing in a
// row), ROW_GAP the horizontal one, and gridRowBody derives its indent from
// both so the grids stay aligned under the label automatically.
const FIELD_WIDTH = 86;
const TILE = 32;
const ROW_GAP = 11;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 10,
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
    fontSize: 21,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: C.text,
    letterSpacing: -0.3,
  },
  saveBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
  },
  saveBtnDisabled: { backgroundColor: C.surface },
  saveBtnText: { fontSize: 12, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.accent },
  saveBtnTextDisabled: { color: C.muted },

  inlineError: {
    fontSize: 12,
    color: C.error,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 20,
  },

  scroll: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 },

  // Plan summary
  planCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 15,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planLabel: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fontFamily.medium,
    color: C.muted,
    letterSpacing: 0.3,
  },
  planNumberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 1 },
  planNumber: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: C.accent,
    letterSpacing: -0.8,
  },
  planUnit: { fontSize: 11.5, fontFamily: fontFamily.regular, fontWeight: '400', color: C.text2 },
  planMacros: { flexDirection: 'row', gap: 10 },
  planMacro: { alignItems: 'center', gap: 1, minWidth: 38 },
  planDot: { width: 6, height: 6, borderRadius: 3 },
  planMacroValue: { fontSize: 12.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text },
  planMacroLabel: { fontSize: 10, fontFamily: fontFamily.regular, fontWeight: '400', color: C.muted },
  planNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.accentSoft,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 9,
  },
  planNoticeText: { flex: 1, fontSize: 11, fontFamily: fontFamily.regular, color: C.text2 },
  planNoticeLink: { fontSize: 11, fontFamily: fontFamily.semibold, fontWeight: '600', color: C.accent },

  // Section label
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '500',
    fontFamily: fontFamily.medium,
    color: C.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 2,
  },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 15,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  // One divider rule for every row shape — spans the card's full inner width.
  divider: { borderBottomWidth: 1, borderBottomColor: C.surface },

  // Row with a right-hand control
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: 8,
    minHeight: 50,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 9,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDanger: { backgroundColor: '#FCE7E8' },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text },
  rowLabelDanger: { color: colors.error },
  rowSub: { fontSize: 11, fontFamily: fontFamily.regular, color: C.muted, marginTop: 2 },

  // Row whose control is a grid below the label
  gridRowWrap: { paddingVertical: 9 },
  gridRowHead: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  // Indent the grid so its left edge lines up with the label above it.
  gridRowBody: { marginLeft: TILE + ROW_GAP, marginTop: 8 },

  // Even choice grid
  grid: { gap: 6 },
  gridLine: { flexDirection: 'row', gap: 6 },
  cell: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 30,
    borderRadius: 8,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cellSpacer: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  cellOn: { backgroundColor: C.accentSoft },
  cellText: { fontSize: 11.5, fontWeight: '400', fontFamily: fontFamily.regular, color: C.text2 },
  cellTextOn: { color: C.accent, fontWeight: '500', fontFamily: fontFamily.medium },

  // Editable value — fixed width so the whole right column lines up
  field: {
    width: FIELD_WIDTH,
    height: 30,
    borderRadius: 8,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 9,
    gap: 3,
  },
  fieldWide: { width: 142 },
  fieldInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fontFamily.medium,
    color: C.text,
    textAlign: 'right',
    padding: 0,
  },
  fieldUnit: { fontSize: 11, color: C.muted, fontFamily: fontFamily.regular },

  // Segmented control
  segment: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 9,
    padding: 2,
    flexShrink: 0,
  },
  segmentBtn: { height: 26, paddingHorizontal: 10, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentBtnOn: {
    backgroundColor: C.card,
    shadowColor: colors.shadowWarmLg,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  segmentText: { fontSize: 11.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.muted },
  segmentTextOn: { color: C.accent },

  // Bottom sheet (recalculation preview)
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  sheetGrabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeading: {
    fontSize: 15.5,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: C.text,
    marginBottom: 6,
  },
  sheetBody: {
    fontSize: 12.5,
    fontFamily: fontFamily.regular,
    color: C.text2,
    lineHeight: 18,
    marginBottom: 14,
  },
  compareCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
  compareLabel: { flex: 1, fontSize: 12, fontFamily: fontFamily.regular, fontWeight: '400', color: C.text2 },
  compareFrom: { fontSize: 12, fontFamily: fontFamily.regular, color: C.muted },
  compareTo: { fontSize: 12.5, fontFamily: fontFamily.semibold, fontWeight: '600', color: C.accent },
  compareToSame: { color: C.text2, fontWeight: '400', fontFamily: fontFamily.regular },

  sheetButtons: { flexDirection: 'row', gap: 10 },
  sheetSecondary: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryText: { fontSize: 13.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text },
  sheetPrimary: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryText: { fontSize: 13.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: '#fff' },

  // Centered modals (discard + delete)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalPanel: { backgroundColor: C.card, borderRadius: 20, padding: 20 },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: C.text,
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 19,
    color: C.text2,
    marginBottom: 16,
    fontFamily: fontFamily.regular,
  },
  modalHint: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fontFamily.medium,
    color: C.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surface,
    marginBottom: 16,
    fontFamily: fontFamily.regular,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontSize: 13.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text },
  modalDeleteBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDeleteBtnDisabled: { opacity: 0.45 },
  modalDeleteText: { fontSize: 13.5, fontWeight: '500', fontFamily: fontFamily.medium, color: '#fff' },
});
