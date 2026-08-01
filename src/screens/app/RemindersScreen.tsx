import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { homeColors as C } from '../../theme/homeColors'
import { colors } from '../../theme/colors'
import { fontFamily } from '../../theme/typography'
import { useReminderStore, ReminderType, ReminderSchedule } from '../../store/reminderStore'
import ReminderTimeSheet from '../../components/reminders/ReminderTimeSheet'

interface ReminderMeta {
  type: ReminderType
  label: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  color: string
}

const REMINDER_META: ReminderMeta[] = [
  { type: 'workout',   label: 'Start Workout',      icon: 'barbell-outline',    color: '#2F6FED' },
  { type: 'meal',      label: 'Track Meal',         icon: 'restaurant-outline', color: '#F5A623' },
  { type: 'water',     label: 'Drink Water',        icon: 'water-outline',      color: '#6366F1' },
  { type: 'walking',   label: 'Start Walking',      icon: 'walk-outline',       color: '#2DD4BF' },
  { type: 'weight',    label: 'Log Weight',         icon: 'scale-outline',      color: '#9B51E0' },
  { type: 'healthLog', label: 'Update Health Log',  icon: 'clipboard-outline',  color: '#F28B82' },
  { type: 'medicine',  label: 'Medicine',           icon: 'medkit-outline',     color: '#34C759' },
]

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>
}

function ReminderRow({
  meta,
  schedule,
  last,
  onPressAction,
  onPressUnset,
}: {
  meta: ReminderMeta
  schedule: ReminderSchedule
  last: boolean
  onPressAction: () => void
  onPressUnset?: () => void
}) {
  const { enabled } = schedule

  return (
    <>
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: enabled ? meta.color + '1F' : C.surface }]}>
          <Ionicons name={meta.icon} size={20} color={enabled ? meta.color : C.muted} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, !enabled && styles.rowLabelMuted]}>{meta.label}</Text>
          <Text style={styles.rowSubtitle}>{schedule.frequencyLabel}</Text>
        </View>
        {enabled && onPressUnset && (
          <TouchableOpacity
            onPress={onPressUnset}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
            style={styles.unsetBtn}
          >
            <Ionicons name="close-circle-outline" size={20} color={C.muted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onPressAction}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}
        >
          <Text style={enabled ? styles.editText : styles.setText}>{enabled ? 'EDIT' : 'SET'}</Text>
        </TouchableOpacity>
      </View>
      {!last && <View style={styles.divider} />}
    </>
  )
}

export default function RemindersScreen() {
  const navigation = useNavigation()
  const reminders = useReminderStore((s) => s.reminders)
  const loading = useReminderStore((s) => s.loading)
  const fetchReminders = useReminderStore((s) => s.fetchReminders)
  const toggleReminder = useReminderStore((s) => s.toggleReminder)
  const setReminderTimes = useReminderStore((s) => s.setReminderTimes)

  const [sheetType, setSheetType] = useState<ReminderType | null>(null)

  useEffect(() => {
    fetchReminders()
  }, [fetchReminders])

  const active = REMINDER_META.filter((m) => reminders[m.type].enabled)
  const available = REMINDER_META.filter((m) => !reminders[m.type].enabled)

  const openSheetFor = (type: ReminderType) => {
    setSheetType(type)
  }

  const handleSetPress = (type: ReminderType) => {
    toggleReminder(type)
    openSheetFor(type)
  }

  const handleSheetSave = (times: string[]) => {
    if (sheetType) setReminderTimes(sheetType, times)
    setSheetType(null)
  }

  const sheetMeta = sheetType ? REMINDER_META.find((m) => m.type === sheetType) : null
  const sheetSchedule = sheetType ? reminders[sheetType] : null

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reminders</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={C.accent} />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {active.length > 0 && (
          <>
            <SectionLabel label="Active Reminders" />
            <View style={styles.card}>
              {active.map((meta, i) => (
                <ReminderRow
                  key={meta.type}
                  meta={meta}
                  schedule={reminders[meta.type]}
                  last={i === active.length - 1}
                  onPressAction={() => openSheetFor(meta.type)}
                  onPressUnset={() => toggleReminder(meta.type)}
                />
              ))}
            </View>
          </>
        )}

        {available.length > 0 && (
          <>
            <SectionLabel label="Reminders you can set" />
            <View style={styles.card}>
              {available.map((meta, i) => (
                <ReminderRow
                  key={meta.type}
                  meta={meta}
                  schedule={reminders[meta.type]}
                  last={i === available.length - 1}
                  onPressAction={() => handleSetPress(meta.type)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      )}

      {sheetMeta && sheetSchedule && (
        <ReminderTimeSheet
          visible={!!sheetType}
          title={`Set ${sheetMeta.label} Time`}
          currentTimes={sheetSchedule.times}
          onSave={handleSheetSave}
          onClose={() => setSheetType(null)}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text },

  scrollContent: { padding: 16, paddingBottom: 40 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  sectionLabel: {
    fontSize: 12, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.muted,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4,
  },
  card: {
    backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', marginBottom: 24,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text },
  rowLabelMuted: { color: C.muted },
  rowSubtitle: { fontSize: 12, fontFamily: fontFamily.regular, color: C.muted },
  editText: { fontSize: 13, fontWeight: '700', fontFamily: fontFamily.bold, color: '#E85D4B' },
  setText: { fontSize: 13, fontWeight: '700', fontFamily: fontFamily.bold, color: C.muted },
  unsetBtn: { padding: 2 },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 66 },
})
