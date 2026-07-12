import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import {
  useBodyMeasurementsStore,
  BodyMeasurementEntry,
  MeasurementField,
  MeasurementInput,
} from '../../store/bodyMeasurementsStore';
import { useAuthStore } from '../../store/authStore';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_H = 160;
const CHART_PADDING_X = 12;
const CHART_PADDING_Y = 20;

const CM_PER_IN = 2.54;

// Each measurable field: label, DB column, and whether it converts with units
// (body_fat_pct is a percentage — never converts, unlike the cm fields).
const FIELDS: { field: MeasurementField; label: string; convertsWithUnits: boolean }[] = [
  { field: 'waist_cm',     label: 'Waist',     convertsWithUnits: true },
  { field: 'hips_cm',      label: 'Hips',      convertsWithUnits: true },
  { field: 'chest_cm',     label: 'Chest',     convertsWithUnits: true },
  { field: 'arms_cm',      label: 'Arms',      convertsWithUnits: true },
  { field: 'thighs_cm',    label: 'Thighs',    convertsWithUnits: true },
  { field: 'neck_cm',      label: 'Neck',      convertsWithUnits: true },
  { field: 'body_fat_pct', label: 'Body fat',  convertsWithUnits: false },
];

// ── Chart — same SVG line-chart shape used by WeightScreen ────────────────────

function MeasurementChart({ points, width, unitLabel }: {
  points: { date: string; value: number }[];
  width: number;
  unitLabel: string;
}) {
  if (points.length < 2) {
    return (
      <View style={[styles.chartEmpty, { width, height: CHART_H }]}>
        <Ionicons name="analytics-outline" size={28} color={C.muted} />
        <Text style={styles.chartEmptyText}>Log at least 2 entries to see this trend</Text>
      </View>
    );
  }

  const chartW = width - CHART_PADDING_X * 2;
  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(maxV - minV, 1);
  const yMin = minV - range * 0.2;
  const yMax = maxV + range * 0.2;

  const toX = (i: number) => CHART_PADDING_X + (i / (points.length - 1)) * chartW;
  const toY = (v: number) =>
    CHART_PADDING_Y + ((yMax - v) / (yMax - yMin)) * (CHART_H - CHART_PADDING_Y * 2);

  const svgPoints = points.map((p, i) => ({ x: toX(i), y: toY(p.value) }));

  let pathD = `M ${svgPoints[0].x} ${svgPoints[0].y}`;
  for (let i = 1; i < svgPoints.length; i++) {
    const prev = svgPoints[i - 1];
    const curr = svgPoints[i];
    const cpX = (prev.x + curr.x) / 2;
    pathD += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const fillD =
    pathD + ` L ${svgPoints[svgPoints.length - 1].x} ${CHART_H} L ${svgPoints[0].x} ${CHART_H} Z`;

  const gridValues = [yMin + (yMax - yMin) * 0.1, yMin + (yMax - yMin) * 0.5, yMin + (yMax - yMin) * 0.9];

  const lastPt = svgPoints[svgPoints.length - 1];
  const lastVal = points[points.length - 1].value;

  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <LinearGradient id="measureGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={C.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {gridValues.map((v, i) => {
        const gy = toY(v);
        return (
          <React.Fragment key={i}>
            <Line x1={CHART_PADDING_X} y1={gy} x2={width - CHART_PADDING_X} y2={gy}
              stroke={C.border} strokeWidth={1} strokeDasharray="4 4" />
            <SvgText x={CHART_PADDING_X + 2} y={gy - 4} fontSize={9} fill={C.muted} fontWeight="500">
              {v.toFixed(1)}
            </SvgText>
          </React.Fragment>
        );
      })}

      <Path d={fillD} fill="url(#measureGrad)" />
      <Path d={pathD} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      <Circle cx={lastPt.x} cy={lastPt.y} r={5} fill={C.accent} />
      <Circle cx={lastPt.x} cy={lastPt.y} r={9} fill={C.accent} fillOpacity={0.18} />
      <SvgText x={lastPt.x} y={lastPt.y - 14} fontSize={11} fontWeight="700" fill={C.accent} textAnchor="middle">
        {lastVal.toFixed(1)}{unitLabel}
      </SvgText>
    </Svg>
  );
}

// ── Metric picker — horizontal chip row ────────────────────────────────────────

function MetricPicker({ value, onChange, entries }: {
  value: MeasurementField;
  onChange: (f: MeasurementField) => void;
  entries: BodyMeasurementEntry[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricRow}>
      {FIELDS.map(({ field, label }) => {
        const on = value === field;
        const hasData = entries.some((e) => e[field] != null);
        return (
          <TouchableOpacity
            key={field}
            style={[styles.metricChip, on && styles.metricChipActive]}
            onPress={() => onChange(field)}
            activeOpacity={0.7}
          >
            <Text style={[styles.metricChipText, on && styles.metricChipTextActive]}>{label}</Text>
            {!hasData && <View style={styles.metricDot} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({
  entry, prev, field, unitLabel, toDisplay, onDelete,
}: {
  entry: BodyMeasurementEntry;
  prev: BodyMeasurementEntry | null;
  field: MeasurementField;
  unitLabel: string;
  toDisplay: (cmOrPct: number) => number;
  onDelete: () => void;
}) {
  const raw = entry[field];
  if (raw == null) return null;

  const value = toDisplay(raw);
  const prevRaw = prev?.[field] ?? null;
  const delta = prevRaw != null ? toDisplay(raw) - toDisplay(prevRaw) : null;

  const date = new Date(entry.logged_date + 'T00:00:00');
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const handleDelete = () => {
    Alert.alert('Delete entry', `Remove this measurement from ${dateStr}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyDate}>{dateStr}</Text>
      <View style={styles.historyRight}>
        <Text style={styles.historyValue}>{value.toFixed(1)}{unitLabel}</Text>
        {delta !== null && Math.abs(delta) > 0.05 && (
          <Text style={[styles.historyDelta, { color: delta <= 0 ? '#34C759' : C.error }]}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} activeOpacity={0.6}>
        <Ionicons name="trash-outline" size={15} color={C.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BodyMeasurementsScreen() {
  const navigation = useNavigation();
  const { entries, range, loading, setRange, fetchEntries, addEntry, deleteEntry } = useBodyMeasurementsStore();
  const profile = useAuthStore((s) => s.profile);
  const units = (profile?.units_system as 'metric' | 'imperial') ?? 'metric';

  const [selectedField, setSelectedField] = useState<MeasurementField>('waist_cm');
  const [formValues, setFormValues] = useState<Record<MeasurementField, string>>({
    waist_cm: '', hips_cm: '', chest_cm: '', arms_cm: '', thighs_cm: '', neck_cm: '', body_fat_pct: '',
  });
  const [saving, setSaving] = useState(false);
  const [chartWidth, setChartWidth] = useState(SCREEN_W - 32);

  useEffect(() => { fetchEntries(); }, []);

  const lengthUnitLabel = units === 'imperial' ? 'in' : 'cm';

  const toDisplay = (field: MeasurementField) => (raw: number) => {
    const meta = FIELDS.find((f) => f.field === field)!;
    return meta.convertsWithUnits && units === 'imperial' ? raw / CM_PER_IN : raw;
  };
  const toStored = (field: MeasurementField, val: number) => {
    const meta = FIELDS.find((f) => f.field === field)!;
    return meta.convertsWithUnits && units === 'imperial' ? val * CM_PER_IN : val;
  };
  const unitFor = (field: MeasurementField) =>
    FIELDS.find((f) => f.field === field)!.convertsWithUnits ? ` ${lengthUnitLabel}` : '%';

  const chartPoints = entries
    .filter((e) => e[selectedField] != null)
    .map((e) => ({ date: e.logged_date, value: toDisplay(selectedField)(e[selectedField]!) }));

  const handleFormChange = (field: MeasurementField, text: string) => {
    setFormValues((s) => ({ ...s, [field]: text }));
  };

  const handleSave = async () => {
    const values: MeasurementInput = {};
    let anyValid = false;

    for (const { field } of FIELDS) {
      const text = formValues[field].trim();
      if (!text) continue;
      const val = parseFloat(text);
      if (isNaN(val) || val <= 0) {
        Alert.alert('Invalid value', `Please enter a valid number for ${FIELDS.find((f) => f.field === field)!.label}, or leave it blank.`);
        return;
      }
      values[field] = parseFloat(toStored(field, val).toFixed(1));
      anyValid = true;
    }

    if (!anyValid) {
      Alert.alert('Nothing to save', 'Enter at least one measurement.');
      return;
    }

    setSaving(true);
    await addEntry(values);
    setSaving(false);
    setFormValues({ waist_cm: '', hips_cm: '', chest_cm: '', arms_cm: '', thighs_cm: '', neck_cm: '', body_fat_pct: '' });
  };

  const historyEntries = [...entries].reverse().filter((e) => e[selectedField] != null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Body Measurements</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Log entry ── */}
          <View style={styles.logCard}>
            <Text style={styles.sectionLabel}>Log today's measurements</Text>
            <Text style={styles.sectionHint}>Fill in whichever ones you took — leave the rest blank</Text>

            <View style={styles.fieldGrid}>
              {FIELDS.map(({ field, label }) => (
                <View key={field} style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <View style={styles.fieldInputWrap}>
                    <TextInput
                      style={styles.fieldInput}
                      value={formValues[field]}
                      onChangeText={(t) => handleFormChange(field, t)}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={C.muted}
                      returnKeyType="done"
                      maxLength={5}
                    />
                    <Text style={styles.fieldUnit}>
                      {FIELDS.find((f) => f.field === field)!.convertsWithUnits ? lengthUnitLabel : '%'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save measurements</Text>
              }
            </TouchableOpacity>
          </View>

          {/* ── Metric picker ── */}
          <MetricPicker value={selectedField} onChange={setSelectedField} entries={entries} />

          {/* ── Chart ── */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>{FIELDS.find((f) => f.field === selectedField)!.label} trend</Text>
              <View style={styles.rangePill}>
                {(['30d', '90d', '1y'] as const).map((r) => {
                  const on = range === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.rangeTab, on && styles.rangeTabActive]}
                      onPress={() => setRange(r)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.rangeText, on && styles.rangeTextActive]}>
                        {r === '30d' ? '30D' : r === '90d' ? '90D' : '1Y'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {loading ? (
              <View style={[styles.chartEmpty, { height: CHART_H }]}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : (
              <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                <MeasurementChart points={chartPoints} width={chartWidth} unitLabel={unitFor(selectedField)} />
              </View>
            )}
          </View>

          {/* ── History ── */}
          {historyEntries.length > 0 && (
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>History</Text>
              {historyEntries.map((entry, i, arr) => (
                <React.Fragment key={entry.id}>
                  <HistoryRow
                    entry={entry}
                    prev={arr[i + 1] ?? null}
                    field={selectedField}
                    unitLabel={unitFor(selectedField)}
                    toDisplay={toDisplay(selectedField)}
                    onDelete={() => deleteEntry(entry.id)}
                  />
                  {i < arr.length - 1 && <View style={styles.historyDivider} />}
                </React.Fragment>
              ))}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: C.text },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: C.text2,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  sectionHint: { fontSize: 12, color: C.muted, marginTop: -4 },

  // Log card
  logCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, gap: 12,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 2,
  },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fieldWrap: { width: '31%', gap: 5 },
  fieldLabel: { fontSize: 11.5, fontWeight: '600', color: C.text2 },
  fieldInputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    borderRadius: 10, paddingHorizontal: 10, height: 40, gap: 3,
  },
  fieldInput: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  fieldUnit: { fontSize: 11, color: C.muted, fontWeight: '500' },

  saveBtn: {
    height: 46, borderRadius: 12, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Metric picker
  metricRow: { gap: 8, paddingVertical: 2 },
  metricChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 6, elevation: 1,
  },
  metricChipActive: { backgroundColor: C.accent },
  metricChipText: { fontSize: 13, fontWeight: '600', color: C.text },
  metricChipTextActive: { color: '#fff' },
  metricDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.border },

  // Chart
  chartCard: {
    backgroundColor: C.card, borderRadius: 16, paddingTop: 14, paddingBottom: 10,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 2, overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, marginBottom: 10,
  },
  chartTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  chartEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  chartEmptyText: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18 },

  rangePill: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 10, padding: 3, gap: 2 },
  rangeTab: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  rangeTabActive: {
    backgroundColor: C.card,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1,
  },
  rangeText: { fontSize: 11.5, fontWeight: '500', color: C.muted },
  rangeTextActive: { color: C.accent, fontWeight: '700' },

  // History
  historyCard: {
    backgroundColor: C.card, borderRadius: 16, overflow: 'hidden',
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 2,
  },
  historyTitle: {
    fontSize: 13, fontWeight: '600', color: C.text2,
    textTransform: 'uppercase', letterSpacing: 0.4,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  historyDate: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text },
  historyRight: { alignItems: 'flex-end', gap: 2 },
  historyValue: { fontSize: 15, fontWeight: '700', color: C.text },
  historyDelta: { fontSize: 11.5, fontWeight: '600' },
  deleteBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  historyDivider: { height: 1, backgroundColor: C.border, marginLeft: 14 },
});
