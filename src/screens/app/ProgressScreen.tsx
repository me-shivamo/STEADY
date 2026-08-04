import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
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
import { fontFamily } from '../../theme/typography';
import { useProgressStore, ProgressDay, DayStatus } from '../../store/progressStore';
import { useWeightStore, computeWeightTrend } from '../../store/weightStore';
import { useAuthStore } from '../../store/authStore';
import { useTdeeStore } from '../../store/tdeeStore';
import { useBodyMeasurementsStore } from '../../store/bodyMeasurementsStore';
import { useStreaks } from '../../hooks/useStreaks';
import { evaluateInsights, describeWeeklyAverages } from '../../utils/insights';
import { AppStackNavProp } from '../../navigation/types';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_H = 160;
const CHART_PADDING_X = 12;
const CHART_PADDING_Y = 20;

// ── Weight trend chart (same math as WeightScreen's WeightChart) ──────────────

function WeightTrendChart({ width }: { width: number }) {
  const entries = useWeightStore((s) => s.entries);
  const profile = useAuthStore((s) => s.profile);
  const units = (profile?.units_system as 'metric' | 'imperial') ?? 'metric';

  if (entries.length < 1) {
    return (
      <View style={[styles.chartEmpty, { width, height: CHART_H }]}>
        <Ionicons name="analytics-outline" size={28} color={C.muted} />
        <Text style={styles.chartEmptyText}>Log a weight entry to start seeing your trend</Text>
      </View>
    );
  }

  const trendPoints = computeWeightTrend(entries);
  const chartW = width - CHART_PADDING_X * 2;
  const weights = trendPoints.flatMap((p) => [p.raw, p.trend]);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = Math.max(maxW - minW, 2);
  const yMin = minW - range * 0.2;
  const yMax = maxW + range * 0.2;

  const toX = (i: number) =>
    trendPoints.length > 1 ? CHART_PADDING_X + (i / (trendPoints.length - 1)) * chartW : width / 2;
  const toY = (w: number) =>
    CHART_PADDING_Y + ((yMax - w) / (yMax - yMin)) * (CHART_H - CHART_PADDING_Y * 2);

  const rawPoints = trendPoints.map((p, i) => ({ x: toX(i), y: toY(p.raw) }));
  const trendLine = trendPoints.map((p, i) => ({ x: toX(i), y: toY(p.trend) }));

  let trendPathD = trendLine.length > 1 ? `M ${trendLine[0].x} ${trendLine[0].y}` : '';
  for (let i = 1; i < trendLine.length; i++) {
    const prev = trendLine[i - 1];
    const curr = trendLine[i];
    const cpX = (prev.x + curr.x) / 2;
    trendPathD += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const fillD =
    trendLine.length > 1
      ? trendPathD + ` L ${trendLine[trendLine.length - 1].x} ${CHART_H} L ${trendLine[0].x} ${CHART_H} Z`
      : '';

  const firstTrend = trendPoints[0].trend;
  const lastTrend = trendPoints[trendPoints.length - 1].trend;
  const delta = lastTrend - firstTrend;

  const fmt = (kg: number) =>
    units === 'imperial' ? `${(kg * 2.20462).toFixed(1)}` : `${kg.toFixed(1)}`;
  const weightUnit = units === 'imperial' ? 'lbs' : 'kg';

  return (
    <View>
      <Svg width={width} height={CHART_H}>
        <Defs>
          <LinearGradient id="progressWeightGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={C.accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {[0.1, 0.5, 0.9].map((f, i) => {
          const gy = toY(yMin + (yMax - yMin) * f);
          return (
            <Line
              key={i}
              x1={CHART_PADDING_X} y1={gy}
              x2={width - CHART_PADDING_X} y2={gy}
              stroke={C.border} strokeWidth={1} strokeDasharray="4 4"
            />
          );
        })}

        {/* Raw weigh-ins: muted, unconnected dots — de-emphasized since the
            whole point of trend weight is to not stare at daily noise. */}
        {rawPoints.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={C.muted} fillOpacity={0.5} />
        ))}

        {trendLine.length > 1 && (
          <>
            <Path d={fillD} fill="url(#progressWeightGrad)" />
            <Path d={trendPathD} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        <Circle cx={trendLine[trendLine.length - 1].x} cy={trendLine[trendLine.length - 1].y} r={5} fill={C.accent} />
        <Circle cx={trendLine[trendLine.length - 1].x} cy={trendLine[trendLine.length - 1].y} r={9} fill={C.accent} fillOpacity={0.18} />
      </Svg>

      <View style={styles.weightSummaryRow}>
        <View style={styles.weightSummaryStats}>
          <View>
            <Text style={styles.weightStatLabel}>Start (trend)</Text>
            <Text style={styles.weightStatValue}>
              {fmt(firstTrend)} <Text style={styles.weightStatUnit}>{weightUnit}</Text>
            </Text>
          </View>
          <View>
            <Text style={styles.weightStatLabel}>Now (trend)</Text>
            <Text style={[styles.weightStatValue, { color: C.accent }]}>
              {fmt(lastTrend)} <Text style={styles.weightStatUnit}>{weightUnit}</Text>
            </Text>
          </View>
        </View>
        {trendPoints.length > 1 && (
          <Text style={[styles.weightDelta, { color: delta <= 0 ? '#34C759' : C.error }]}>
            {delta <= 0 ? 'Lost' : 'Gained'} {Math.abs(delta * (units === 'imperial' ? 2.20462 : 1)).toFixed(1)} {weightUnit}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Week navigator ─────────────────────────────────────────────────────────────

function WeekNavigator() {
  const { weekOffset, week, setWeekOffset } = useProgressStore();
  return (
    <View style={styles.weekNav}>
      <TouchableOpacity
        onPress={() => setWeekOffset(weekOffset + 1)}
        style={styles.weekNavBtn}
        activeOpacity={0.6}
      >
        <Ionicons name="chevron-back" size={18} color={C.accent} />
      </TouchableOpacity>
      <View style={styles.weekNavLabel}>
        <Text style={styles.weekNavTitle}>{week?.label ?? ''}</Text>
        <Text style={styles.weekNavRange}>{week?.rangeLabel ?? ''}</Text>
      </View>
      <TouchableOpacity
        onPress={() => setWeekOffset(Math.max(weekOffset - 1, 0))}
        style={styles.weekNavBtn}
        disabled={weekOffset <= 0}
        activeOpacity={0.6}
      >
        <Ionicons name="chevron-forward" size={18} color={weekOffset <= 0 ? C.border : C.accent} />
      </TouchableOpacity>
    </View>
  );
}

// ── Summary stat tile ──────────────────────────────────────────────────────────

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ── Daily breakdown row ─────────────────────────────────────────────────────────

const STATUS_META: Record<DayStatus, { label: string; color: keyof typeof C | string }> = {
  ok: { label: 'On goal', color: '#34C759' },
  over: { label: 'Over', color: C.carbs },
  today: { label: 'Today', color: C.accent },
  miss: { label: 'Missed', color: C.error },
  future: { label: '—', color: C.muted },
};

function DayRow({ day, goalKcal, last }: { day: ProgressDay; goalKcal: number; last: boolean }) {
  const meta = STATUS_META[day.status];
  const logged = day.calories !== null;
  const barWidth = logged ? Math.min(((day.calories ?? 0) / goalKcal) * 100, 100) : 0;
  const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <View style={[styles.dayRow, !last && styles.dayRowDivider]}>
      <View style={styles.dayRowHeader}>
        <Text style={[styles.dayWeekday, day.status === 'future' && { color: C.muted }]}>{day.weekday}</Text>
        <Text style={styles.dayDate}>{dateLabel}</Text>
        <View style={{ flex: 1 }} />
        {logged ? (
          <Text style={styles.dayCalories}>
            {day.calories!.toLocaleString()} <Text style={styles.dayCaloriesUnit}>kcal</Text>
          </Text>
        ) : (
          <Text style={[styles.dayStatusLabel, { color: meta.color }]}>{meta.label}</Text>
        )}
      </View>

      <View style={styles.dayBarTrack}>
        {logged && (
          <View style={[styles.dayBarFill, { width: `${barWidth}%`, backgroundColor: meta.color }]} />
        )}
      </View>

      {logged && (
        <View style={styles.macroChipRow}>
          <MacroChip label="P" value={day.protein_g} color={C.protein} />
          <MacroChip label="C" value={day.carbs_g} color={C.carbs} />
          <MacroChip label="F" value={day.fat_g} color={C.fat} />
          {day.status !== 'today' && (
            <View style={styles.dayStatusPillWrap}>
              <View style={[styles.dayStatusDot, { backgroundColor: meta.color }]} />
              <Text style={[styles.dayStatusPillText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.macroChip, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.macroChipLabel, { color }]}>{label}</Text>
      <Text style={[styles.macroChipValue, { color }]}>{value}g</Text>
    </View>
  );
}

// ── Weekly average macro bar ────────────────────────────────────────────────────

function MacroAverageBar({ label, value, goal, color, unit = 'g' }: {
  label: string; value: number; goal: number; color: string; unit?: string;
}) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  return (
    <View style={styles.avgBarWrap}>
      <View style={styles.avgBarHeader}>
        <Text style={styles.avgBarLabel}>{label}</Text>
        <Text style={styles.avgBarValue}>
          {value.toLocaleString()} / {goal.toLocaleString()}{unit} avg
        </Text>
      </View>
      <View style={styles.avgBarTrack}>
        <View style={[styles.avgBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Streak card ─────────────────────────────────────────────────────────────────

function StreakCard({ current, best }: { current: number; best: number }) {
  return (
    <View style={styles.streakCard}>
      <View style={styles.streakItem}>
        <View style={styles.streakPill}>
          <Ionicons name="flame" size={14} color={C.accent} />
          <Text style={styles.streakPillText}>{current} day{current === 1 ? '' : 's'}</Text>
        </View>
        <Text style={styles.streakLabel}>Current streak</Text>
      </View>
      <View style={styles.streakDivider} />
      <View style={styles.streakItem}>
        <View style={styles.streakPill}>
          <Ionicons name="trophy" size={14} color={C.accent} />
          <Text style={styles.streakPillText}>{best} day{best === 1 ? '' : 's'}</Text>
        </View>
        <Text style={styles.streakLabel}>Best streak</Text>
      </View>
    </View>
  );
}

// ── TDEE (estimated maintenance) card ───────────────────────────────────────────

function TdeeCard() {
  const { estimate, status, daysLogged, weightSpanDays } = useTdeeStore();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [updating, setUpdating] = useState(false);

  if (status === 'insufficient_data') {
    const daysNeeded = Math.max(0, 14 - daysLogged);
    const spanNeeded = Math.max(0, 14 - weightSpanDays);
    return (
      <View style={styles.card}>
        <View style={styles.tdeeHeaderRow}>
          <Ionicons name="flash-outline" size={18} color={C.accent} />
          <Text style={styles.tdeeTitle}>Estimated maintenance</Text>
        </View>
        <Text style={styles.tdeeEmptyText}>
          Keep logging food and weight. {daysNeeded > 0 ? `${daysNeeded} more day${daysNeeded === 1 ? '' : 's'} of food logs` : 'A bit more weight history'}
          {daysNeeded > 0 && spanNeeded > 0 ? ' and ' : ''}
          {spanNeeded > 0 ? `weigh-ins spanning ${spanNeeded} more day${spanNeeded === 1 ? '' : 's'}` : ''}
          {' '}will unlock a personalized estimate of how many calories you actually burn.
        </Text>
      </View>
    );
  }

  if (!estimate) return null;

  const handleUpdateGoal = async () => {
    setUpdating(true);
    try {
      await updateProfile({ calorie_goal: estimate.smoothedTdee });
    } finally {
      setUpdating(false);
    }
  };

  const isBelow = estimate.deltaVsGoal > 100;
  const isAbove = estimate.deltaVsGoal < -100;

  return (
    <View style={styles.card}>
      <View style={styles.tdeeHeaderRow}>
        <Ionicons name="flash-outline" size={18} color={C.accent} />
        <Text style={styles.tdeeTitle}>Estimated maintenance</Text>
      </View>
      <Text style={styles.tdeeValue}>
        ~{estimate.smoothedTdee.toLocaleString()} <Text style={styles.tdeeValueUnit}>kcal/day</Text>
      </Text>
      <Text style={styles.tdeeSub}>
        Based on your last {estimate.windowDays} days of food logs and weight trend.
      </Text>
      {(isBelow || isAbove) && (
        <Text style={styles.tdeeComparison}>
          {isBelow
            ? `You're eating ~${estimate.deltaVsGoal} kcal below this, consistent with a real deficit.`
            : `You're eating ~${Math.abs(estimate.deltaVsGoal)} kcal above this, which may explain slower-than-expected progress.`}
        </Text>
      )}
      {Math.abs(estimate.deltaVsGoal) >= 100 && (
        <TouchableOpacity
          style={styles.tdeeButton}
          onPress={handleUpdateGoal}
          disabled={updating}
          activeOpacity={0.8}
        >
          {updating ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Text style={styles.tdeeButtonText}>Update goal to {estimate.smoothedTdee.toLocaleString()} kcal</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Body measurement trend link card ────────────────────────────────────────────

function BodyMeasurementLinkCard() {
  const navigation = useNavigation<AppStackNavProp>();
  const { latestSummary } = useBodyMeasurementsStore();

  const fieldLabel = latestSummary?.latestField === 'body_fat_pct' ? 'Body fat' : 'Waist';
  const unit = latestSummary?.latestField === 'body_fat_pct' ? '%' : 'cm';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('BodyMeasurements')}
      activeOpacity={0.7}
    >
      {latestSummary?.latestValue != null ? (
        <View style={styles.bodyMeasureRow}>
          <View>
            <Text style={styles.bodyMeasureLabel}>{fieldLabel}</Text>
            <Text style={styles.bodyMeasureValue}>
              {latestSummary.latestValue.toFixed(1)}{unit}
            </Text>
          </View>
          {latestSummary.deltaFromPrevious != null && (
            <View style={styles.bodyMeasureDeltaWrap}>
              <Ionicons
                name={latestSummary.deltaFromPrevious <= 0 ? 'arrow-down' : 'arrow-up'}
                size={14}
                color={latestSummary.deltaFromPrevious <= 0 ? '#34C759' : C.error}
              />
              <Text style={[styles.bodyMeasureDelta, { color: latestSummary.deltaFromPrevious <= 0 ? '#34C759' : C.error }]}>
                {Math.abs(latestSummary.deltaFromPrevious).toFixed(1)}{unit}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </View>
      ) : (
        <View style={styles.bodyMeasureRow}>
          <Text style={styles.bodyMeasureEmptyText}>
            Track your waist, chest, and body fat % to see trends beyond the scale
          </Text>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const navigation = useNavigation();
  const { week, weekdayPattern, bestWeek, loading, fetchWeek, fetchWeekdayPattern, fetchBestWeek } = useProgressStore();
  const fetchWeightEntries = useWeightStore((s) => s.fetchEntries);
  const fetchTdeeEstimate = useTdeeStore((s) => s.fetchEstimate);
  const tdeeEstimate = useTdeeStore((s) => s.estimate);
  const tdeeStatus = useTdeeStore((s) => s.status);
  const fetchLatestTwo = useBodyMeasurementsStore((s) => s.fetchLatestTwo);
  const profile = useAuthStore((s) => s.profile);
  const streaks = useStreaks(week);
  const [chartWidth, setChartWidth] = useState(SCREEN_W - 32 - 24);

  useEffect(() => {
    fetchWeek();
    fetchWeekdayPattern();
    fetchBestWeek();
    fetchWeightEntries();
    fetchTdeeEstimate();
    fetchLatestTwo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goalKcal = profile?.calorie_goal ?? 2000;
  const goalP = profile?.protein_goal_g ?? 0;
  const goalC = profile?.carb_goal_g ?? 0;
  const goalF = profile?.fat_goal_g ?? 0;

  const days = week?.days ?? [];
  const elapsed = days.filter((d) => d.status !== 'future');
  const logged = days.filter((d) => d.calories !== null);
  const onGoal = days.filter((d) => d.status === 'ok' || d.status === 'today').length;

  const avg = (fn: (d: ProgressDay) => number) =>
    logged.length ? Math.round(logged.reduce((a, d) => a + fn(d), 0) / logged.length) : 0;
  const avgKcal = avg((d) => d.calories ?? 0);
  const avgP = avg((d) => d.protein_g);
  const avgC = avg((d) => d.carbs_g);
  const avgF = avg((d) => d.fat_g);

  const currentWeekAdherencePct = elapsed.length ? (onGoal / elapsed.length) * 100 : null;

  const insight = evaluateInsights({
    avgP,
    goalP,
    tdee: tdeeEstimate,
    tdeeStatus,
    weekdayAvgCalories: weekdayPattern?.weekdayAvg ?? null,
    weekendAvgCalories: weekdayPattern?.weekendAvg ?? null,
    currentStreak: streaks?.current ?? null,
    bestStreak: streaks?.best ?? null,
    isCurrentWeekBest: bestWeek?.isCurrentWeekBest ?? false,
    currentWeekAdherencePct,
    bestWeekAdherencePct: bestWeek?.adherencePct ?? null,
    elapsedDaysThisWeek: elapsed.length,
  });

  // The line under the Weekly averages bars is about THOSE bars, so it is
  // derived from the same numbers rather than from evaluateInsights(), whose
  // rules cover streaks/TDEE/weekend patterns and never look at the calorie
  // average or how many days were actually logged.
  const weeklySummary = describeWeeklyAverages({
    avgKcal,
    goalKcal,
    avgP,
    goalP,
    daysLogged: logged.length,
    elapsedDays: elapsed.length,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Report</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <WeekNavigator />

        <View style={styles.summaryRow}>
          <SummaryStat value={avgKcal.toLocaleString()} label="Avg cal / day" />
          <SummaryStat value={`${onGoal}/${elapsed.length}`} label="Days on goal" />
          <SummaryStat value={`${logged.length}/${elapsed.length}`} label="Days logged" />
        </View>

        {streaks && <StreakCard current={streaks.current} best={streaks.best} />}

        <Text style={styles.sectionLabel}>Daily breakdown</Text>
        <View style={styles.card}>
          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={C.accent} />
            </View>
          ) : (
            days.map((d, i) => (
              <DayRow key={d.date} day={d} goalKcal={goalKcal} last={i === days.length - 1} />
            ))
          )}
        </View>

        <Text style={styles.sectionLabel}>Weekly averages</Text>
        <View style={styles.card}>
          <MacroAverageBar label="Calories" value={avgKcal} goal={goalKcal} color={C.accent} unit="" />
          <MacroAverageBar label="Protein" value={avgP} goal={goalP} color={C.protein} />
          <MacroAverageBar label="Carbs" value={avgC} goal={goalC} color={C.carbs} />
          <MacroAverageBar label="Fat" value={avgF} goal={goalF} color={C.fat} />
          <View style={styles.insightRow}>
            <Ionicons name={weeklySummary.icon as any} size={16} color={C.accent} style={{ marginTop: 1 }} />
            <Text style={styles.insightText}>{weeklySummary.text}</Text>
          </View>
          {/* The rule-based insight (streak milestone, TDEE drift, weekend
              pattern, protein gap) is still worth showing — but only when a
              real rule fired. 'strong_week' is evaluateInsights' catch-all
              fallback, and it is precisely the generic filler that made this
              section feel canned, so it is suppressed. */}
          {insight.id !== 'strong_week' && (
            <View style={styles.insightRow}>
              <Ionicons name={insight.icon as any} size={16} color={C.accent} style={{ marginTop: 1 }} />
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>Estimated maintenance</Text>
        <TdeeCard />

        <Text style={styles.sectionLabel}>Weight trend</Text>
        <View style={[styles.card, { paddingTop: 16, paddingHorizontal: 12 }]}>
          <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
            <WeightTrendChart width={chartWidth} />
          </View>
        </View>

        <BodyMeasurementLinkCard />

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

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
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 15.5, fontWeight: '600',
    fontFamily: fontFamily.semibold, color: C.text,
  },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  sectionLabel: {
    fontSize: 11.5, fontWeight: '600', fontFamily: fontFamily.semibold,
    color: C.text2, textTransform: 'uppercase', letterSpacing: 0.4,
  },

  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 2,
  },

  // Week navigator
  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: 14, padding: 8,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 2,
  },
  weekNavBtn: {
    width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  weekNavLabel: { alignItems: 'center' },
  weekNavTitle: { fontSize: 14, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text },
  weekNavRange: { fontSize: 11, color: C.text2, marginTop: 1, fontFamily: fontFamily.regular },

  // Summary tiles
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryTile: {
    flex: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 6,
    alignItems: 'center',
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  summaryValue: { fontSize: 16.5, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text },
  summaryLabel: { fontSize: 10, color: C.text2, marginTop: 4, textAlign: 'center', fontFamily: fontFamily.regular },

  // Daily breakdown
  dayRow: { paddingVertical: 13 },
  dayRowDivider: { borderBottomWidth: 1, borderBottomColor: C.surface },
  dayRowHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 9 },
  dayWeekday: { fontSize: 13, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text },
  dayDate: { fontSize: 11, color: C.muted, fontFamily: fontFamily.regular },
  dayCalories: { fontSize: 13, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text },
  dayCaloriesUnit: { fontSize: 10.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text2 },
  dayStatusLabel: { fontSize: 11, fontWeight: '600', fontFamily: fontFamily.semibold },
  dayBarTrack: { height: 8, borderRadius: 4, backgroundColor: C.surface, overflow: 'hidden' },
  dayBarFill: { height: '100%', borderRadius: 4 },
  macroChipRow: { flexDirection: 'row', gap: 7, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' },
  macroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 20, paddingHorizontal: 8, borderRadius: 7,
  },
  macroChipLabel: { fontSize: 10.5, fontWeight: '700', fontFamily: fontFamily.bold, opacity: 0.75 },
  macroChipValue: { fontSize: 10.5, fontWeight: '700', fontFamily: fontFamily.bold },
  dayStatusPillWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  dayStatusDot: { width: 6, height: 6, borderRadius: 3 },
  dayStatusPillText: { fontSize: 10, fontWeight: '600', fontFamily: fontFamily.semibold },

  // Weekly averages
  avgBarWrap: { marginBottom: 16 },
  avgBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  avgBarLabel: { fontSize: 12.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text },
  avgBarValue: { fontSize: 11.5, color: C.text2, fontWeight: '600', fontFamily: fontFamily.semibold },
  avgBarTrack: { height: 9, borderRadius: 5, backgroundColor: C.surface, overflow: 'hidden' },
  avgBarFill: { height: '100%', borderRadius: 5 },
  insightRow: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 4,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: C.surface,
  },
  insightText: { flex: 1, fontSize: 11.5, color: C.text2, lineHeight: 16, fontFamily: fontFamily.regular },

  // Streak card
  streakCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, paddingVertical: 14,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 2,
  },
  streakItem: { flex: 1, alignItems: 'center', gap: 6 },
  streakDivider: { width: 1, height: 32, backgroundColor: C.border },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 24, paddingHorizontal: 11, borderRadius: 20, backgroundColor: C.accentSoft,
  },
  streakPillText: { fontSize: 11.5, fontWeight: '700', fontFamily: fontFamily.bold, color: C.accent },
  streakLabel: { fontSize: 10, color: C.text2, fontFamily: fontFamily.regular },

  // TDEE card
  tdeeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  tdeeTitle: { fontSize: 13, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text },
  tdeeValue: { fontSize: 22, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text },
  tdeeValueUnit: { fontSize: 12, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text2 },
  tdeeSub: { fontSize: 11, color: C.text2, marginTop: 4, fontFamily: fontFamily.regular, lineHeight: 15 },
  tdeeComparison: { fontSize: 11.5, color: C.text, marginTop: 10, fontFamily: fontFamily.regular, lineHeight: 16 },
  tdeeEmptyText: { fontSize: 11.5, color: C.text2, lineHeight: 16, fontFamily: fontFamily.regular },
  tdeeButton: {
    marginTop: 12, height: 40, borderRadius: 10, backgroundColor: C.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  tdeeButtonText: { fontSize: 12, fontWeight: '700', fontFamily: fontFamily.bold, color: C.accent },

  // Body measurement link card
  bodyMeasureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bodyMeasureLabel: { fontSize: 10.5, color: C.text2, fontFamily: fontFamily.regular },
  bodyMeasureValue: { fontSize: 15, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text, marginTop: 2 },
  bodyMeasureDeltaWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  bodyMeasureDelta: { fontSize: 11.5, fontWeight: '600', fontFamily: fontFamily.semibold },
  bodyMeasureEmptyText: { flex: 1, fontSize: 11.5, color: C.text2, lineHeight: 16, fontFamily: fontFamily.regular },

  // Weight trend
  chartEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, alignSelf: 'center' },
  chartEmptyText: { fontSize: 11.5, color: C.muted, textAlign: 'center', lineHeight: 16, fontFamily: fontFamily.regular },
  weightSummaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4,
  },
  weightSummaryStats: { flexDirection: 'row', gap: 18 },
  weightStatLabel: { fontSize: 10.5, color: C.muted, marginBottom: 2, fontFamily: fontFamily.regular },
  weightStatValue: { fontSize: 16, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text },
  weightStatUnit: { fontSize: 10.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text2 },
  weightDelta: { fontSize: 12.5, fontWeight: '700', fontFamily: fontFamily.bold },
});
