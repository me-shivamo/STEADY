import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { useWaterStore } from '../../store/waterStore';
import { AppStackParamList } from '../../navigation/types';

const ML_PER_OZ = 29.5735;
const QUICK_ADD_ML = 250; // ~1 cup

export default function WaterHomeCard({ goalMl, units }: {
  goalMl: number;
  units: 'metric' | 'imperial';
}) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { entries, fetchToday, addEntry, deleteEntry } = useWaterStore();

  useEffect(() => { fetchToday(); }, []);

  const totalMl = entries.reduce((sum, e) => sum + e.amount_ml, 0);
  const pct = goalMl > 0 ? Math.min(totalMl / goalMl, 1) : 0;
  const unitLabel = units === 'imperial' ? 'fl oz' : 'ml';
  const fmt = (ml: number) => units === 'imperial' ? Math.round(ml / ML_PER_OZ) : ml;

  const handleAdd = () => {
    addEntry(units === 'imperial' ? Math.round(QUICK_ADD_ML) : QUICK_ADD_ML);
  };

  const handleRemoveLast = () => {
    if (entries.length === 0) return;
    const last = entries[entries.length - 1];
    deleteEntry(last.id);
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('Water')}
    >
      <View style={styles.headRow}>
        <Ionicons name="water" size={15} color={C.accent} />
        <Text style={styles.title}>Water: {fmt(totalMl)} {unitLabel}</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          style={[styles.stepBtn, entries.length === 0 && styles.stepBtnDisabled]}
          onPress={handleRemoveLast}
          activeOpacity={0.7}
          disabled={entries.length === 0}
        >
          <Ionicons name="remove" size={18} color={C.text} />
        </TouchableOpacity>

        <View style={styles.centerText}>
          <Text style={styles.entryCount}>{entries.length} {entries.length === 1 ? 'log' : 'logs'}</Text>
          <Text style={styles.remainingText}>
            {pct >= 1 ? 'Goal reached' : `${fmt(Math.max(goalMl - totalMl, 0))} ${unitLabel} remaining`}
          </Text>
        </View>

        <TouchableOpacity style={styles.stepBtn} onPress={handleAdd} activeOpacity={0.7}>
          <Ionicons name="add" size={18} color={C.text} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
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
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  centerText: {
    alignItems: 'center',
    gap: 1,
  },
  entryCount: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  remainingText: {
    fontSize: 11.5,
    color: C.muted,
  },
});
