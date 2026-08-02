import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { homeColors as C } from '../../theme/homeColors'
import { colors } from '../../theme/colors'
import { fontFamily } from '../../theme/typography'
import { useReminderStore, ReminderType, ReminderSchedule, summarizeConfig } from '../../store/reminderStore'
import { AppStackNavProp } from '../../navigation/types'

interface ReminderMeta {
  type: ReminderType
  label: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  color: string
  hint: string
}

const REMINDER_META: ReminderMeta[] = [
  { type: 'workout',   label: 'Start Workout',      icon: 'barbell-outline',    color: '#6366F1', hint: 'Daily' },
  { type: 'meal',      label: 'Track Meal',         icon: 'restaurant-outline', color: '#2FB67A', hint: 'At meal times' },
  { type: 'water',     label: 'Drink Water',        icon: 'water-outline',      color: '#2F6FED', hint: 'Through the day' },
  { type: 'walking',   label: 'Start Walking',      icon: 'walk-outline',       color: '#0EA5A5', hint: 'Daily' },
  { type: 'weight',    label: 'Log Weight',         icon: 'scale-outline',      color: '#9B51E0', hint: 'Weekly or monthly' },
  { type: 'healthLog', label: 'Update Health Log',  icon: 'clipboard-outline',  color: '#F5A623', hint: 'Weekly or monthly' },
  { type: 'medicine',  label: 'Medicine',           icon: 'medkit-outline',     color: '#E5398A', hint: 'Set doses' },
]

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>
}

function ActiveRow({
  meta, schedule, last, onEdit, onCancel,
}: {
  meta: ReminderMeta
  schedule: ReminderSchedule
  last: boolean
  onEdit: () => void
  onCancel: () => void
}) {
  return (
    <>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: meta.color + '1F' }]}>
          <Ionicons name={meta.icon} size={19} color={meta.color} />
        </View>
        <TouchableOpacity onPress={onEdit} activeOpacity={0.7} style={styles.rowText}>
          <Text style={styles.rowLabel}>{meta.label}</Text>
          <Text style={styles.rowSubtitle}>{summarizeConfig(schedule.config)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit} activeOpacity={0.7} style={styles.editBtn}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}
          style={styles.unsetBtn}
        >
          <Ionicons name="close-circle-outline" size={18} color={C.muted} />
        </TouchableOpacity>
      </View>
      {!last && <View style={styles.divider} />}
    </>
  )
}

function InactiveRow({
  meta, last, onSet,
}: {
  meta: ReminderMeta
  last: boolean
  onSet: () => void
}) {
  return (
    <>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: C.surface }]}>
          <Ionicons name={meta.icon} size={19} color={C.muted} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, styles.rowLabelMuted]}>{meta.label}</Text>
          <Text style={styles.rowSubtitle}>{meta.hint}</Text>
        </View>
        <TouchableOpacity onPress={onSet} activeOpacity={0.7} style={styles.setBtn}>
          <Text style={styles.setBtnText}>Set</Text>
        </TouchableOpacity>
      </View>
      {!last && <View style={styles.divider} />}
    </>
  )
}

export default function RemindersScreen() {
  const navigation = useNavigation<AppStackNavProp>()
  const reminders = useReminderStore((s) => s.reminders)
  const loading = useReminderStore((s) => s.loading)
  const fetchReminders = useReminderStore((s) => s.fetchReminders)
  const toggleReminder = useReminderStore((s) => s.toggleReminder)

  useEffect(() => {
    fetchReminders()
  }, [fetchReminders])

  const active = REMINDER_META.filter((m) => reminders[m.type].enabled)
  const inactive = REMINDER_META.filter((m) => !reminders[m.type].enabled)

  const openDetail = (type: ReminderType) => navigation.navigate('ReminderDetail', { type })

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reminders</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={C.accent} />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Steady nudges you at the right moments. Turn any habit on and tailor its schedule.
        </Text>

        {active.length > 0 && (
          <>
            <SectionLabel label={`Active · ${active.length}`} />
            <View style={styles.card}>
              {active.map((meta, i) => (
                <ActiveRow
                  key={meta.type}
                  meta={meta}
                  schedule={reminders[meta.type]}
                  last={i === active.length - 1}
                  onEdit={() => openDetail(meta.type)}
                  onCancel={() => toggleReminder(meta.type)}
                />
              ))}
            </View>
          </>
        )}

        {inactive.length > 0 && (
          <>
            <SectionLabel label={active.length ? 'More you can set' : 'Reminders you can set'} />
            <View style={styles.card}>
              {inactive.map((meta, i) => (
                <InactiveRow
                  key={meta.type}
                  meta={meta}
                  last={i === inactive.length - 1}
                  onSet={() => openDetail(meta.type)}
                />
              ))}
            </View>
          </>
        )}

        {active.length === 0 && (
          <Text style={styles.emptyHint}>No active reminders yet. Tap Set on any habit above.</Text>
        )}
      </ScrollView>
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
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text },

  scrollContent: { padding: 16, paddingBottom: 40 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  intro: { fontSize: 13, color: C.text2, fontFamily: fontFamily.regular, lineHeight: 18, marginBottom: 18, marginHorizontal: 2 },

  sectionLabel: {
    fontSize: 11.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.muted,
    letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4,
  },
  card: {
    backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', marginBottom: 20,
    paddingHorizontal: 4,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 12, paddingVertical: 13, gap: 11 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text },
  rowLabelMuted: { color: C.text2 },
  rowSubtitle: { fontSize: 11.5, fontFamily: fontFamily.regular, color: C.muted },

  editBtn: { height: 28, paddingHorizontal: 11, borderRadius: 8, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  editBtnText: { fontSize: 12, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.accent },
  setBtn: { height: 29, paddingHorizontal: 14, borderRadius: 9, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  setBtnText: { fontSize: 12.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: '#fff' },
  unsetBtn: { padding: 2 },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 15, marginRight: 12 },

  emptyHint: { fontSize: 12, color: C.muted, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 20 },
})
