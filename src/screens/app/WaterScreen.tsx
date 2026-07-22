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
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { useWaterStore, WaterEntry } from '../../store/waterStore';
import { useAuthStore } from '../../store/authStore';

const RING_SIZE = 168;
const RING_STROKE = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

const ML_PER_OZ = 29.5735;
const QUICK_ADD_ML = [100, 250, 350, 500];

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const clamped = Math.min(Math.max(pct, 0), 1);
  const offset = RING_CIRC * (1 - clamped);

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={C.surface}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={C.accent}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
          strokeDashoffset={offset}
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringValue}>{label}</Text>
        <Text style={styles.ringSub}>{sub}</Text>
      </View>
    </View>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({
  entry, units, onDelete,
}: {
  entry: WaterEntry;
  units: 'metric' | 'imperial';
  onDelete: () => void;
}) {
  const display = units === 'imperial'
    ? `${Math.round(entry.amount_ml / ML_PER_OZ)} fl oz`
    : `${entry.amount_ml} ml`;

  const time = entry.logged_at
    ? new Date(entry.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  const handleDelete = () => {
    Alert.alert('Delete entry', `Remove ${display} logged at ${time}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.historyRow}>
      <View style={styles.historyIcon}>
        <Ionicons name="water" size={15} color={C.accent} />
      </View>
      <View style={styles.historyLeft}>
        <Text style={styles.historyAmount}>{display}</Text>
        <Text style={styles.historyTime}>{time}</Text>
      </View>
      <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} activeOpacity={0.6}>
        <Ionicons name="trash-outline" size={15} color={C.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ── Enable prompt — shown when water tracking is off ────────────────────────────

function EnableWaterPrompt({ units, onEnable, enabling }: {
  units: 'metric' | 'imperial';
  onEnable: (goalMl: number) => void;
  enabling: boolean;
}) {
  const unitLabel = units === 'imperial' ? 'fl oz' : 'ml';
  const defaultGoal = units === 'imperial' ? '85' : '2500'; // ~2500ml
  const [goalInput, setGoalInput] = useState(defaultGoal);

  const handleEnable = () => {
    const val = parseFloat(goalInput);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid goal', `Please enter a goal in ${unitLabel}.`);
      return;
    }
    const ml = units === 'imperial' ? Math.round(val * ML_PER_OZ) : Math.round(val);
    onEnable(ml);
  };

  return (
    <View style={styles.promptWrap}>
      <View style={styles.promptIcon}>
        <Ionicons name="water" size={32} color={C.accent} />
      </View>
      <Text style={styles.promptTitle}>Track your water intake</Text>
      <Text style={styles.promptBody}>
        Set a daily goal and log water from this screen, the home card, or just by telling STEADY what you drank.
      </Text>

      <View style={styles.promptGoalRow}>
        <Text style={styles.promptGoalLabel}>Daily goal</Text>
        <View style={styles.goalEditInputWrap}>
          <TextInput
            style={styles.goalEditInput}
            value={goalInput}
            onChangeText={setGoalInput}
            keyboardType="decimal-pad"
            placeholder={unitLabel}
            placeholderTextColor={C.muted}
            returnKeyType="done"
            maxLength={6}
          />
          <Text style={styles.logUnit}>{unitLabel}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.enableBtn, enabling && styles.logBtnDisabled]}
        onPress={handleEnable}
        activeOpacity={0.8}
        disabled={enabling}
      >
        {enabling
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.enableBtnText}>Enable water tracking</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function WaterScreen() {
  const navigation = useNavigation();
  const { entries, loading, fetchToday, addEntry, deleteEntry } = useWaterStore();
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const units = (profile?.units_system as 'metric' | 'imperial') ?? 'metric';
  const goalMl = profile?.water_goal_ml ?? 2500;
  const trackingEnabled = profile?.water_tracking_enabled ?? false;

  const [inputVal, setInputVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [togglingTracking, setTogglingTracking] = useState(false);

  useEffect(() => {
    if (trackingEnabled) fetchToday();
  }, [trackingEnabled]);

  const handleEnableTracking = async (initialGoalMl: number) => {
    setTogglingTracking(true);
    await updateProfile({ water_tracking_enabled: true, water_goal_ml: initialGoalMl });
    setTogglingTracking(false);
  };

  const handleDisableTracking = () => {
    Alert.alert(
      'Turn off water tracking?',
      'Your logged history stays saved, but the water card will disappear from Home.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: async () => {
            setTogglingTracking(true);
            await updateProfile({ water_tracking_enabled: false });
            setTogglingTracking(false);
          },
        },
      ]
    );
  };

  const totalMl = entries.reduce((sum, e) => sum + e.amount_ml, 0);
  const pct = goalMl > 0 ? totalMl / goalMl : 0;
  const unitLabel = units === 'imperial' ? 'fl oz' : 'ml';

  const fmt = (ml: number) =>
    units === 'imperial' ? Math.round(ml / ML_PER_OZ) : ml;

  const handleQuickAdd = async (ml: number) => {
    await addEntry(ml);
  };

  const handleLog = async () => {
    const val = parseFloat(inputVal);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid amount', `Please enter an amount in ${unitLabel}.`);
      return;
    }
    const ml = units === 'imperial' ? Math.round(val * ML_PER_OZ) : Math.round(val);
    setSaving(true);
    await addEntry(ml);
    setSaving(false);
    setInputVal('');
  };

  const openEditGoal = () => {
    setGoalInput(String(fmt(goalMl)));
    setEditingGoal(true);
  };

  const handleSaveGoal = async () => {
    const val = parseFloat(goalInput);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid goal', `Please enter a goal in ${unitLabel}.`);
      return;
    }
    const ml = units === 'imperial' ? Math.round(val * ML_PER_OZ) : Math.round(val);
    setSavingGoal(true);
    await updateProfile({ water_goal_ml: ml });
    setSavingGoal(false);
    setEditingGoal(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Water</Text>
        {trackingEnabled ? (
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={openEditGoal} style={styles.goalBtn} activeOpacity={0.6}>
              <Ionicons name="create-outline" size={20} color={C.accent} />
            </TouchableOpacity>
            <Switch
              value={trackingEnabled}
              onValueChange={(next) => { if (!next) handleDisableTracking(); }}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#fff"
              disabled={togglingTracking}
            />
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {!trackingEnabled ? (
        <EnableWaterPrompt units={units} onEnable={handleEnableTracking} enabling={togglingTracking} />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Progress ring ── */}
          <View style={styles.ringCard}>
            {loading ? (
              <View style={{ height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : (
              <ProgressRing
                pct={pct}
                label={`${fmt(totalMl)} ${unitLabel}`}
                sub={`of ${fmt(goalMl)} ${unitLabel}`}
              />
            )}
            {pct >= 1 && !editingGoal && (
              <Text style={styles.goalHitText}>Goal reached! 🎉</Text>
            )}

            {editingGoal ? (
              <View style={styles.goalEditRow}>
                <View style={styles.goalEditInputWrap}>
                  <TextInput
                    style={styles.goalEditInput}
                    value={goalInput}
                    onChangeText={setGoalInput}
                    keyboardType="decimal-pad"
                    placeholder={unitLabel}
                    placeholderTextColor={C.muted}
                    returnKeyType="done"
                    maxLength={6}
                    autoFocus
                  />
                  <Text style={styles.logUnit}>{unitLabel}</Text>
                </View>
                <TouchableOpacity
                  style={styles.goalSaveBtn}
                  onPress={handleSaveGoal}
                  activeOpacity={0.8}
                  disabled={savingGoal}
                >
                  {savingGoal
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="checkmark" size={18} color="#fff" />
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.goalCancelBtn}
                  onPress={() => setEditingGoal(false)}
                  activeOpacity={0.6}
                >
                  <Ionicons name="close" size={18} color={C.muted} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={openEditGoal} activeOpacity={0.6}>
                <Text style={styles.editGoalText}>Edit daily goal</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Quick add ── */}
          <View style={styles.logCard}>
            <Text style={styles.sectionLabel}>Quick add</Text>
            <View style={styles.quickRow}>
              {QUICK_ADD_ML.map((ml) => (
                <TouchableOpacity
                  key={ml}
                  style={styles.quickChip}
                  onPress={() => handleQuickAdd(ml)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="water-outline" size={16} color={C.accent} />
                  <Text style={styles.quickChipText}>
                    {units === 'imperial' ? `${Math.round(ml / ML_PER_OZ)} oz` : `${ml} ml`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Custom amount</Text>
            <View style={styles.logRow}>
              <View style={styles.logInputWrap}>
                <TextInput
                  style={styles.logInput}
                  value={inputVal}
                  onChangeText={setInputVal}
                  keyboardType="decimal-pad"
                  placeholder={units === 'imperial' ? 'e.g. 8' : 'e.g. 250'}
                  placeholderTextColor={C.muted}
                  returnKeyType="done"
                  maxLength={6}
                />
                <Text style={styles.logUnit}>{unitLabel}</Text>
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
          </View>

          {/* ── Today's history ── */}
          {entries.length > 0 && (
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>Today</Text>
              {[...entries].reverse().map((entry, i, arr) => (
                <React.Fragment key={entry.id}>
                  <HistoryRow
                    entry={entry}
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
      )}
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
  goalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },

  // Enable prompt
  promptWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  promptIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  promptTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  promptBody: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  promptGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  promptGoalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  enableBtn: {
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    alignSelf: 'stretch',
  },
  enableBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Ring card
  ringCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
  },
  ringSub: {
    fontSize: 12.5,
    color: C.muted,
    marginTop: 2,
  },
  goalHitText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.accent,
  },
  editGoalText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    textDecorationLine: 'underline',
  },
  goalEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    width: '100%',
  },
  goalEditInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    gap: 4,
  },
  goalEditInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  goalSaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCancelBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
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
    gap: 10,
  },
  historyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyLeft: { flex: 1, gap: 1 },
  historyAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  historyTime: {
    fontSize: 12,
    color: C.muted,
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
