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
      <Ionicons name="water" size={16} color={C.accent} />

      <Text style={styles.total} numberOfLines={1}>{fmt(totalMl)} {unitLabel}</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>

      <TouchableOpacity
        style={[styles.stepBtn, entries.length === 0 && styles.stepBtnDisabled]}
        onPress={handleRemoveLast}
        activeOpacity={0.7}
        disabled={entries.length === 0}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Ionicons name="remove" size={16} color={C.text} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.stepBtn}
        onPress={handleAdd}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <Ionicons name="add" size={16} color={C.text} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1,
  },
  total: {
    fontSize: 12.5,
    fontWeight: '600',
    color: C.text,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
});
