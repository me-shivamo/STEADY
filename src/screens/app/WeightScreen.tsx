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
import { useWeightStore, WeightEntry } from '../../store/weightStore';
import { useAuthStore } from '../../store/authStore';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_H = 180;
const CHART_PADDING_X = 12;
const CHART_PADDING_Y = 20;

// ── Chart ─────────────────────────────────────────────────────────────────────

function WeightChart({ entries, width, units }: {
  entries: WeightEntry[];
  width: number;
  units: 'metric' | 'imperial';
}) {
  if (entries.length < 2) {
    return (
      <View style={[styles.chartEmpty, { width, height: CHART_H }]}>
        <Ionicons name="analytics-outline" size={32} color={C.muted} />
        <Text style={styles.chartEmptyText}>Log at least 2 entries to see your trend</Text>
      </View>
    );
  }

  const chartW = width - CHART_PADDING_X * 2;
  const weights = entries.map((e) => e.weight_kg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = Math.max(maxW - minW, 2);
  const yMin = minW - range * 0.2;
  const yMax = maxW + range * 0.2;

  const toX = (i: number) => CHART_PADDING_X + (i / (entries.length - 1)) * chartW;
  const toY = (w: number) =>
    CHART_PADDING_Y + ((yMax - w) / (yMax - yMin)) * (CHART_H - CHART_PADDING_Y * 2);

  const points = entries.map((e, i) => ({ x: toX(i), y: toY(e.weight_kg) }));

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev.x + curr.x) / 2;
    pathD += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const fillD =
    pathD + ` L ${points[points.length - 1].x} ${CHART_H} L ${points[0].x} ${CHART_H} Z`;

  const gridValues = [
    yMin + (yMax - yMin) * 0.1,
    yMin + (yMax - yMin) * 0.5,
    yMin + (yMax - yMin) * 0.9,
  ];

  const lastPt = points[points.length - 1];
  const lastVal = entries[entries.length - 1].weight_kg;
  const lastLabel = units === 'imperial'
    ? `${(lastVal * 2.20462).toFixed(1)} lbs`
    : `${lastVal.toFixed(1)} kg`;

  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <LinearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={C.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {gridValues.map((v, i) => {
        const gy = toY(v);
        return (
          <React.Fragment key={i}>
            <Line
              x1={CHART_PADDING_X} y1={gy}
              x2={width - CHART_PADDING_X} y2={gy}
              stroke={C.border} strokeWidth={1} strokeDasharray="4 4"
            />
            <SvgText x={CHART_PADDING_X + 2} y={gy - 4} fontSize={9} fill={C.muted} fontWeight="500">
              {v.toFixed(1)}
            </SvgText>
          </React.Fragment>
        );
      })}

      <Path d={fillD} fill="url(#weightGrad)" />
      <Path d={pathD} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      <Circle cx={lastPt.x} cy={lastPt.y} r={5} fill={C.accent} />
      <Circle cx={lastPt.x} cy={lastPt.y} r={9} fill={C.accent} fillOpacity={0.18} />
      <SvgText x={lastPt.x} y={lastPt.y - 14} fontSize={11} fontWeight="700" fill={C.accent} textAnchor="middle">
        {lastLabel}
      </SvgText>
    </Svg>
  );
}

// ── Range toggle ──────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | '90d';
const RANGES: { label: string; value: Range }[] = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '3 Months', value: '90d' },
];

function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <View style={styles.rangePill}>
      {RANGES.map((r) => {
        const on = value === r.value;
        return (
          <TouchableOpacity
            key={r.value}
            style={[styles.rangeTab, on && styles.rangeTabActive]}
            onPress={() => onChange(r.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.rangeText, on && styles.rangeTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({
  entry, prev, units, onDelete,
}: {
  entry: WeightEntry;
  prev: WeightEntry | null;
  units: 'metric' | 'imperial';
  onDelete: () => void;
}) {
  const delta = prev ? entry.weight_kg - prev.weight_kg : null;
  const display = units === 'imperial'
    ? `${(entry.weight_kg * 2.20462).toFixed(1)} lbs`
    : `${entry.weight_kg.toFixed(1)} kg`;

  const date = new Date(entry.logged_date + 'T00:00:00');
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const handleDelete = () => {
    Alert.alert('Delete entry', `Remove ${display} logged on ${dateStr}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.historyRow}>
      <View style={styles.historyLeft}>
        <Text style={styles.historyDate}>{dateStr}</Text>
        {entry.notes ? <Text style={styles.historyNote}>{entry.notes}</Text> : null}
      </View>
      <View style={styles.historyRight}>
        <Text style={styles.historyWeight}>{display}</Text>
        {delta !== null && (
          <Text style={[styles.historyDelta, { color: delta <= 0 ? '#34C759' : C.error }]}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
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

export default function WeightScreen() {
  const navigation = useNavigation();
  const { entries, range, loading, setRange, fetchEntries, addEntry, deleteEntry } = useWeightStore();
  const profile = useAuthStore((s) => s.profile);
  const units = (profile?.units_system as 'metric' | 'imperial') ?? 'metric';

  const [inputVal, setInputVal] = useState('');
  const [inputNote, setInputNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [chartWidth, setChartWidth] = useState(SCREEN_W - 32);

  useEffect(() => { fetchEntries(); }, []);

  const last = entries[entries.length - 1] ?? null;
  const first = entries[0] ?? null;
  const goal = profile?.goal_weight_kg ?? null;
  const totalChange = first && last ? last.weight_kg - first.weight_kg : null;

  const fmt = (kg: number | null) => {
    if (kg === null) return '—';
    return units === 'imperial' ? `${(kg * 2.20462).toFixed(1)} lbs` : `${kg.toFixed(1)} kg`;
  };

  const weightUnit = units === 'imperial' ? 'lbs' : 'kg';

  const handleLog = async () => {
    const val = parseFloat(inputVal);
    const minVal = units === 'imperial' ? 44 : 20;
    const maxVal = units === 'imperial' ? 1100 : 500;
    if (isNaN(val) || val < minVal || val > maxVal) {
      Alert.alert('Invalid weight', `Please enter a weight between ${minVal} and ${maxVal} ${weightUnit}.`);
      return;
    }
    const kg = units === 'imperial' ? val / 2.20462 : val;
    setSaving(true);
    await addEntry(parseFloat(kg.toFixed(2)), inputNote.trim() || undefined);
    setSaving(false);
    setInputVal('');
    setInputNote('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weight</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Log today's weight ── */}
          <View style={styles.logCard}>
            <Text style={styles.sectionLabel}>Log today's weight</Text>
            <View style={styles.logRow}>
              <View style={styles.logInputWrap}>
                <TextInput
                  style={styles.logInput}
                  value={inputVal}
                  onChangeText={setInputVal}
                  keyboardType="decimal-pad"
                  placeholder={`e.g. ${units === 'imperial' ? '165' : '75'}`}
                  placeholderTextColor={C.muted}
                  returnKeyType="done"
                  maxLength={6}
                />
                <Text style={styles.logUnit}>{weightUnit}</Text>
              </View>
              <TouchableOpacity
                style={[styles.logBtn, (!inputVal || saving) && styles.logBtnDisabled]}
                onPress={handleLog}
                activeOpacity={0.8}
                disabled={!inputVal || saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.logBtnText}>Log</Text>
                }
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.noteInput}
              value={inputNote}
              onChangeText={setInputNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={C.muted}
              maxLength={100}
            />
          </View>

          {/* ── Stats strip ── */}
          <View style={styles.statsRow}>
            <StatCard label="Current" value={fmt(last?.weight_kg ?? null)} />
            <StatCard
              label={`Change (${range})`}
              value={
                totalChange !== null
                  ? `${totalChange > 0 ? '+' : ''}${
                      units === 'imperial'
                        ? (totalChange * 2.20462).toFixed(1) + ' lbs'
                        : totalChange.toFixed(1) + ' kg'
                    }`
                  : '—'
              }
              sub={totalChange !== null && totalChange < 0 ? 'Great progress!' : undefined}
            />
            <StatCard label="Goal" value={fmt(goal)} />
          </View>

          {/* ── Chart ── */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Trend</Text>
              <RangeToggle value={range} onChange={setRange} />
            </View>

            {loading ? (
              <View style={[styles.chartEmpty, { height: CHART_H }]}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : (
              <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
                <WeightChart entries={entries} width={chartWidth} units={units} />
              </View>
            )}

            {entries.length >= 2 && (
              <View style={styles.xLabels}>
                <Text style={styles.xLabel}>
                  {new Date(entries[0].logged_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
                <Text style={styles.xLabel}>
                  {new Date(entries[entries.length - 1].logged_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            )}
          </View>

          {/* ── History ── */}
          {entries.length > 0 && (
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>History</Text>
              {[...entries].reverse().map((entry, i, arr) => (
                <React.Fragment key={entry.id}>
                  <HistoryRow
                    entry={entry}
                    prev={arr[i + 1] ?? null}
                    units={units}
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

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Log card
  logCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    gap: 4,
  },
  logInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
  },
  logUnit: {
    fontSize: 15,
    color: C.muted,
    fontWeight: '500',
  },
  logBtn: {
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnDisabled: { opacity: 0.45 },
  logBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  noteInput: {
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 10.5,
    color: C.text2,
    marginTop: 2,
    textAlign: 'center',
  },
  statSub: {
    fontSize: 10,
    color: '#34C759',
    fontWeight: '600',
    marginTop: 1,
  },

  // Chart
  chartCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    paddingTop: 14,
    paddingBottom: 10,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  chartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  chartEmptyText: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginTop: 4,
  },
  xLabel: {
    fontSize: 10.5,
    color: C.muted,
    fontWeight: '500',
  },

  // Range toggle
  rangePill: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  rangeTab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  rangeTabActive: {
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  rangeText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: C.muted,
  },
  rangeTextActive: {
    color: C.accent,
    fontWeight: '700',
  },

  // History
  historyCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  historyLeft: { flex: 1, gap: 2 },
  historyDate: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text,
  },
  historyNote: {
    fontSize: 12,
    color: C.muted,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  historyWeight: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  historyDelta: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDivider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 14,
  },
});
