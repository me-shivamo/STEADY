import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Switch, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { homeColors as C } from '../../theme/homeColors'
import { colors } from '../../theme/colors'
import { fontFamily } from '../../theme/typography'
import DrumPicker from '../../components/common/DrumPicker'
import {
  useReminderStore, ReminderType, ReminderConfig,
  DailyConfig, MealsConfig, WaterConfig, RecurringConfig, MedicineConfig, Medicine,
  MEAL_SLOTS, WEEKDAYS, ordinal, formatTime12,
} from '../../store/reminderStore'
import { AppStackParamList } from '../../navigation/types'

// ─── Per-type presentation (icon, tint, description copy) ──────────────────
const META: Record<ReminderType, {
  label: string; icon: React.ComponentProps<typeof Ionicons>['name']; tint: string; soft: string
  lead: string; desc: string
}> = {
  workout:   { label: 'Start Workout',     icon: 'barbell-outline',    tint: '#6366F1', soft: '#ECEAFE',
    lead: 'Get reminded to start your workout',
    desc: 'Workout reminders keep you motivated to gear up. Once you finish, they let you log your session right away.' },
  meal:      { label: 'Track Meal',        icon: 'restaurant-outline', tint: '#2FB67A', soft: '#E4F6EE',
    lead: 'Get reminded to track your meals',
    desc: 'Meal reminders work best set for 30 minutes after each meal. Aim to log every meal to keep your day accurate.' },
  water:     { label: 'Drink Water',       icon: 'water-outline',      tint: '#2F6FED', soft: '#E7EFFE',
    lead: 'Get reminded to drink water',
    desc: 'Water reminders help you meet your hydration goal of at least 8 glasses a day.' },
  walking:   { label: 'Start Walking',     icon: 'walk-outline',       tint: '#0EA5A5', soft: '#DEF5F4',
    lead: 'Get reminded to walk',
    desc: 'Walk reminders help you lift your daily step count and burn a few extra calories, even on busy days.' },
  weight:    { label: 'Log Weight',        icon: 'scale-outline',      tint: '#9B51E0', soft: '#F3E9FC',
    lead: 'Get reminded to track your weight',
    desc: 'Weight reminders help you log your weight regularly so you can keep a close watch on your goal.' },
  healthLog: { label: 'Update Health Log', icon: 'clipboard-outline',  tint: '#F5A623', soft: '#FEF3DF',
    lead: 'Get reminded to update your health log',
    desc: 'Health log reminders help you record how you feel and celebrate your progress over time.' },
  medicine:  { label: 'Medicine',          icon: 'medkit-outline',     tint: '#E5398A', soft: '#FCE7F2',
    lead: 'Get reminded to take your medicine',
    desc: 'Add each medicine to your cabinet and set the doses you want to be reminded about.' },
}

type Route = RouteProp<AppStackParamList, 'ReminderDetail'>

// ── Small shared controls ───────────────────────────────────────────────────
function CheckBox({ on }: { on: boolean }) {
  return (
    <View style={[styles.checkbox, on && styles.checkboxOn]}>
      {on && <Ionicons name="checkmark" size={13} color="#fff" />}
    </View>
  )
}
function RadioDot({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]} />
}
function TimePill({ value, onPress, muted }: { value: string; onPress: () => void; muted?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.pill, muted && styles.pillMuted]}>
      <Text style={[styles.pillText, muted && styles.pillTextMuted]}>{formatTime12(value)}</Text>
      <Ionicons name="chevron-down" size={12} color={muted ? C.muted : C.accent} />
    </TouchableOpacity>
  )
}
function Stepper({ value, min, max, onChange, format }: {
  value: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string
}) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
      >
        <Text style={[styles.stepperBtnText, value <= min && styles.stepperBtnTextDisabled]}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{format ? format(value) : value}</Text>
      <TouchableOpacity
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
        style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
      >
        <Text style={[styles.stepperBtnText, value >= max && styles.stepperBtnTextDisabled]}>+</Text>
      </TouchableOpacity>
    </View>
  )
}
function OptionRow({ selected, control, label, desc, onPress, right, last }: {
  selected: boolean; control: React.ReactNode; label: string; desc?: string
  onPress: () => void; right?: React.ReactNode; last?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.optionRow, !last && styles.optionRowBorder]}
    >
      {control}
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, !selected && styles.optionLabelMuted]}>{label}</Text>
        {desc ? <Text style={styles.optionDesc}>{desc}</Text> : null}
      </View>
      {right}
    </TouchableOpacity>
  )
}

// ── Time picker bottom sheet, reusing STEADY's DrumPicker ──────────────────
const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const PERIODS = ['AM', 'PM']

function to12Hour(hour24: number) {
  const periodIndex = hour24 < 12 ? 0 : 1
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { hour12Index: hour12 - 1, periodIndex }
}
function to24Hour(hour12Index: number, periodIndex: number) {
  const hour12 = hour12Index + 1
  if (periodIndex === 0) return hour12 === 12 ? 0 : hour12
  return hour12 === 12 ? 12 : hour12 + 12
}

function TimeSheet({ visible, title, value, onSave, onClose }: {
  visible: boolean; title: string; value: string
  onSave: (v: string) => void; onClose: () => void
}) {
  const [h, m] = value.split(':').map(Number)
  const { hour12Index, periodIndex } = to12Hour(h)
  const [draft, setDraft] = useState({ hour12Index, minute: m, periodIndex })
  const [drumKey, setDrumKey] = useState(0)

  React.useEffect(() => {
    if (visible) {
      const [vh, vm] = value.split(':').map(Number)
      const t = to12Hour(vh)
      setDraft({ hour12Index: t.hour12Index, minute: vm, periodIndex: t.periodIndex })
      setDrumKey((k) => k + 1)
    }
  }, [visible, value])

  const save = () => {
    const hour24 = to24Hour(draft.hour12Index, draft.periodIndex)
    onSave(`${String(hour24).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetStyles.backdrop}>
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={sheetStyles.title}>{title}</Text>
              <Text style={sheetStyles.subtitle}>
                {formatTime12(`${String(to24Hour(draft.hour12Index, draft.periodIndex)).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`)}
              </Text>
            </View>
            <TouchableOpacity style={sheetStyles.saveBtn} onPress={save} activeOpacity={0.8}>
              <Text style={sheetStyles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
          <View style={sheetStyles.timeRow}>
            <View style={sheetStyles.drumCol}>
              <DrumPicker
                key={`h-${drumKey}`}
                values={HOURS_12}
                selectedIndex={draft.hour12Index}
                onIndexChange={(i) => setDraft((d) => ({ ...d, hour12Index: i }))}
                style={sheetStyles.drumPicker}
              />
              <Text style={sheetStyles.drumLabel}>Hour</Text>
            </View>
            <Text style={sheetStyles.colon}>:</Text>
            <View style={sheetStyles.drumCol}>
              <DrumPicker
                key={`m-${drumKey}`}
                values={MINUTES}
                selectedIndex={draft.minute}
                onIndexChange={(i) => setDraft((d) => ({ ...d, minute: i }))}
                style={sheetStyles.drumPicker}
              />
              <Text style={sheetStyles.drumLabel}>Minute</Text>
            </View>
            <View style={sheetStyles.drumCol}>
              <DrumPicker
                key={`p-${drumKey}`}
                values={PERIODS}
                selectedIndex={draft.periodIndex}
                onIndexChange={(i) => setDraft((d) => ({ ...d, periodIndex: i }))}
                style={sheetStyles.drumPicker}
              />
              <Text style={sheetStyles.drumLabel}>Period</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Per-type body components ────────────────────────────────────────────────
function DailyBody({ d, set, openTime }: { d: DailyConfig; set: (c: DailyConfig) => void; openTime: (title: string, value: string, cb: (v: string) => void) => void }) {
  return (
    <OptionRow
      selected
      control={<CheckBox on />}
      label="Remind me every day at"
      onPress={() => openTime('Reminder time', d.time, (v) => set({ ...d, time: v }))}
      right={<TimePill value={d.time} onPress={() => openTime('Reminder time', d.time, (v) => set({ ...d, time: v }))} />}
      last
    />
  )
}

function MealsBody({ d, set, openTime }: { d: MealsConfig; set: (c: MealsConfig) => void; openTime: (title: string, value: string, cb: (v: string) => void) => void }) {
  return (
    <View>
      {MEAL_SLOTS.map(({ key, label }, i) => {
        const slot = d.meals[key]
        return (
          <OptionRow
            key={key}
            selected={slot.on}
            control={<CheckBox on={slot.on} />}
            label={label}
            last={i === MEAL_SLOTS.length - 1}
            onPress={() => set({ ...d, meals: { ...d.meals, [key]: { ...slot, on: !slot.on } } })}
            right={
              <TimePill
                muted={!slot.on}
                value={slot.time}
                onPress={() => openTime(`${label} time`, slot.time, (v) =>
                  set({ ...d, meals: { ...d.meals, [key]: { ...slot, time: v } } }))}
              />
            }
          />
        )
      })}
    </View>
  )
}

function WaterBody({ d, set, openTime }: { d: WaterConfig; set: (c: WaterConfig) => void; openTime: (title: string, value: string, cb: (v: string) => void) => void }) {
  const setCount = (n: number) => {
    const times = [...d.times]
    while (times.length < n) times.push('12:00')
    times.length = n
    set({ ...d, times })
  }
  return (
    <View>
      <View style={styles.waterWindow}>
        <Text style={styles.waterWindowLabel}>Active window</Text>
        <View style={styles.waterWindowRow}>
          <TimePill value={d.from} onPress={() => openTime('Start time', d.from, (v) => set({ ...d, from: v }))} />
          <Text style={styles.waterTo}>to</Text>
          <TimePill value={d.to} onPress={() => openTime('End time', d.to, (v) => set({ ...d, to: v }))} />
        </View>
      </View>
      <View style={styles.divider} />
      <OptionRow
        selected={d.mode === 'hourly'}
        control={<RadioDot on={d.mode === 'hourly'} />}
        label="Remind me every hour"
        desc="Within the active window"
        onPress={() => set({ ...d, mode: 'hourly' })}
      />
      <OptionRow
        selected={d.mode === 'times'}
        control={<RadioDot on={d.mode === 'times'} />}
        label="Remind me at set times"
        onPress={() => set({ ...d, mode: 'times' })}
        last
        right={<Stepper value={d.times.length} min={2} max={6} onChange={setCount} />}
      />
      {d.mode === 'times' && (
        <View style={styles.timesList}>
          {d.times.map((t, i) => (
            <View key={i} style={[styles.timesRow, i === d.times.length - 1 && styles.timesRowLast]}>
              <View style={styles.timesIndex}>
                <Text style={styles.timesIndexText}>{i + 1}</Text>
              </View>
              <Text style={styles.timesLabel}>Reminder {i + 1}</Text>
              <TimePill
                value={t}
                onPress={() => openTime(`Reminder ${i + 1}`, t, (v) =>
                  set({ ...d, times: d.times.map((x, j) => (j === i ? v : x)) }))}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function RecurringBody({ d, set, openTime }: { d: RecurringConfig; set: (c: RecurringConfig) => void; openTime: (title: string, value: string, cb: (v: string) => void) => void }) {
  return (
    <View>
      <OptionRow
        selected={d.freq === 'week'}
        control={<RadioDot on={d.freq === 'week'} />}
        label="Every week"
        onPress={() => set({ ...d, freq: 'week' })}
      />
      {d.freq === 'week' && (
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((w) => {
            const on = d.day === w
            return (
              <TouchableOpacity
                key={w}
                onPress={() => set({ ...d, day: w })}
                activeOpacity={0.7}
                style={[styles.weekdayChip, on && styles.weekdayChipOn]}
              >
                <Text style={[styles.weekdayChipText, on && styles.weekdayChipTextOn]}>{w[0]}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
      <OptionRow
        selected={d.freq === 'month'}
        control={<RadioDot on={d.freq === 'month'} />}
        label="Every month"
        onPress={() => set({ ...d, freq: 'month' })}
        last={d.freq !== 'month'}
        right={
          d.freq === 'month'
            ? <Stepper value={d.date} min={1} max={28} onChange={(v) => set({ ...d, date: v })} format={ordinal} />
            : <Text style={styles.monthHint}>on the {ordinal(d.date)}</Text>
        }
      />
      {d.freq === 'month' && <View style={styles.divider} />}
      <OptionRow
        selected
        control={<CheckBox on />}
        label="At"
        last
        onPress={() => openTime('Reminder time', d.time, (v) => set({ ...d, time: v }))}
        right={<TimePill value={d.time} onPress={() => openTime('Reminder time', d.time, (v) => set({ ...d, time: v }))} />}
      />
    </View>
  )
}

function MedicineBody({ d, set, openTime }: { d: MedicineConfig; set: (c: MedicineConfig) => void; openTime: (title: string, value: string, cb: (v: string) => void) => void }) {
  const remove = (i: number) => set({ ...d, meds: d.meds.filter((_, j) => j !== i) })
  const add = () => set({
    ...d,
    meds: [...d.meds, { id: `${Date.now()}`, name: '', dose: '1 tablet', time: '09:00', days: [] }],
  })
  const updateMed = (i: number, patch: Partial<Medicine>) =>
    set({ ...d, meds: d.meds.map((m, j) => (j === i ? { ...m, ...patch } : m)) })
  const toggleDay = (i: number, day: string) => {
    const med = d.meds[i]
    const days = med.days.includes(day) ? med.days.filter((x) => x !== day) : [...med.days, day]
    updateMed(i, { days })
  }

  return (
    <View>
      {d.meds.map((med, i) => (
        <View key={med.id} style={[styles.medBlock, i === d.meds.length - 1 && styles.medBlockLast]}>
          <View style={styles.medRow}>
            <View style={styles.medIcon}>
              <Ionicons name="medkit-outline" size={18} color="#E5398A" />
            </View>
            <View style={styles.medInfo}>
              <TextInput
                value={med.name}
                onChangeText={(text) => updateMed(i, { name: text })}
                placeholder="Medicine name"
                placeholderTextColor={C.muted}
                style={styles.medNameInput}
              />
              <TextInput
                value={med.dose}
                onChangeText={(text) => updateMed(i, { dose: text })}
                placeholder="Dose, e.g. 1 tablet"
                placeholderTextColor={C.muted}
                style={styles.medDoseInput}
              />
            </View>
            <TimePill value={med.time} onPress={() => openTime(`${med.name || 'Medicine'} time`, med.time, (v) => updateMed(i, { time: v }))} />
            <TouchableOpacity onPress={() => remove(i)} style={styles.medRemove} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={15} color={C.muted} />
            </TouchableOpacity>
          </View>
          <View style={styles.medDayRow}>
            {WEEKDAYS.map((w) => {
              const on = med.days.length === 0 || med.days.includes(w)
              const dimmed = med.days.length === 0
              return (
                <TouchableOpacity
                  key={w}
                  onPress={() => toggleDay(i, w)}
                  activeOpacity={0.7}
                  style={[styles.medDayChip, on && !dimmed && styles.medDayChipOn]}
                >
                  <Text style={[styles.medDayChipText, on && !dimmed && styles.medDayChipTextOn]}>{w[0]}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={styles.medDayHint}>
            {med.days.length === 0 ? 'Every day' : `${med.days.length} ${med.days.length === 1 ? 'day' : 'days'} a week`}
          </Text>
        </View>
      ))}
      <TouchableOpacity onPress={add} style={styles.medAdd} activeOpacity={0.7}>
        <View style={styles.medAddIcon}>
          <Ionicons name="add" size={20} color={C.accent} />
        </View>
        <Text style={styles.medAddText}>Add new medicine</Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Root screen ──────────────────────────────────────────────────────────────
export default function ReminderDetailScreen() {
  const navigation = useNavigation()
  const route = useRoute<Route>()
  const type = route.params.type
  const meta = META[type]

  const schedule = useReminderStore((s) => s.reminders[type])
  const saveReminderConfig = useReminderStore((s) => s.saveReminderConfig)

  const [draft, setDraft] = useState<ReminderConfig>(schedule.config)
  // Opening this screen always starts as "on" — enabled here is a draft only
  // (see handleSave below), so nothing is actually turned on in the store or
  // DB until Save is tapped. Backing out (header back button, hardware back)
  // never calls saveReminderConfig, so a reminder that was off before stays
  // off if the user leaves without saving, even though the toggle showed on
  // while they were editing.
  const [enabled, setEnabled] = useState(true)
  const [timeSheet, setTimeSheet] = useState<{ title: string; value: string; cb: (v: string) => void } | null>(null)
  const [saving, setSaving] = useState(false)

  const openTime = (title: string, value: string, cb: (v: string) => void) => setTimeSheet({ title, value, cb })

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveReminderConfig(type, draft, enabled)
      navigation.goBack()
    } finally {
      setSaving(false)
    }
  }

  const off = !enabled

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{meta.label}</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: C.surface, true: C.accent }}
          thumbColor="#fff"
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.lead}>
          <View style={[styles.leadIcon, { backgroundColor: meta.soft }]}>
            <Ionicons name={meta.icon} size={21} color={meta.tint} />
          </View>
          <Text style={styles.leadText}>{meta.lead}</Text>
        </View>
        <Text style={styles.desc}>{meta.desc}</Text>

        <View style={[styles.card, off && styles.cardOff]} pointerEvents={off ? 'none' : 'auto'}>
          {draft.kind === 'daily' && <DailyBody d={draft} set={setDraft} openTime={openTime} />}
          {draft.kind === 'meals' && <MealsBody d={draft} set={setDraft} openTime={openTime} />}
          {draft.kind === 'water' && <WaterBody d={draft} set={setDraft} openTime={openTime} />}
          {draft.kind === 'recurring' && <RecurringBody d={draft} set={setDraft} openTime={openTime} />}
          {draft.kind === 'medicine' && <MedicineBody d={draft} set={setDraft} openTime={openTime} />}
        </View>
        {off && <Text style={styles.offHint}>This reminder is turned off. Toggle it on to edit the schedule.</Text>}
      </ScrollView>

      <View style={styles.saveBar}>
        <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>{enabled ? 'Save reminder' : 'Turn off reminder'}</Text>
        </TouchableOpacity>
      </View>

      {timeSheet && (
        <TimeSheet
          visible
          title={timeSheet.title}
          value={timeSheet.value}
          onSave={(v) => { timeSheet.cb(v); setTimeSheet(null) }}
          onClose={() => setTimeSheet(null)}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10,
    paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text },

  scrollContent: { padding: 16, paddingBottom: 24 },

  lead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, marginTop: 4 },
  leadIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  leadText: { flex: 1, fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text, lineHeight: 21 },
  desc: { fontSize: 13, color: C.text2, fontFamily: fontFamily.regular, lineHeight: 18, marginBottom: 18 },

  card: {
    backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14,
    shadowColor: colors.shadowWarm, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  cardOff: { opacity: 0.5 },
  offHint: { fontSize: 12, color: C.muted, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 14 },

  saveBar: { padding: 16, paddingBottom: 20, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  saveBtn: { height: 48, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fontFamily.semibold, color: '#fff' },

  // shared controls
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.accent, borderWidth: 0 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, backgroundColor: '#fff' },
  radioOn: { borderWidth: 6, borderColor: C.accent },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 31, paddingHorizontal: 11, borderRadius: 9, backgroundColor: C.accentSoft },
  pillMuted: { backgroundColor: C.surface },
  pillText: { fontSize: 13, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.accent },
  pillTextMuted: { color: C.text2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 29, height: 29, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { borderColor: C.surface },
  stepperBtnText: { fontSize: 17, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.accent },
  stepperBtnTextDisabled: { color: C.border },
  stepperValue: { minWidth: 40, textAlign: 'center', fontSize: 14, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text },

  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  optionRowBorder: { borderBottomWidth: 1, borderBottomColor: C.surface },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text },
  optionLabelMuted: { color: C.text2 },
  optionDesc: { fontSize: 11.5, color: C.muted, fontFamily: fontFamily.regular, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.surface },

  // water
  waterWindow: { paddingVertical: 13 },
  waterWindowLabel: { fontSize: 13, color: C.text2, fontFamily: fontFamily.medium, marginBottom: 9 },
  waterWindowRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  waterTo: { fontSize: 12, color: C.muted, fontFamily: fontFamily.regular },
  timesList: { backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 12, marginTop: 6, marginBottom: 8 },
  timesRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 11 },
  timesRowLast: { borderBottomWidth: 0 },
  timesIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  timesIndexText: { fontSize: 11.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.accent },
  timesLabel: { flex: 1, fontSize: 13, color: C.text2, fontFamily: fontFamily.medium },

  // recurring
  weekdayRow: { flexDirection: 'row', gap: 6, paddingVertical: 9 },
  weekdayChip: { flex: 1, height: 38, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  weekdayChipOn: { backgroundColor: C.accent },
  weekdayChipText: { fontSize: 12.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text2 },
  weekdayChipTextOn: { color: '#fff' },
  monthHint: { fontSize: 13, color: C.muted, fontWeight: '500', fontFamily: fontFamily.medium },

  // medicine
  medBlock: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.surface },
  medBlockLast: { borderBottomWidth: 0 },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  medIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.fatSoft, alignItems: 'center', justifyContent: 'center' },
  medInfo: { flex: 1, gap: 1 },
  medNameInput: { fontSize: 14, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text, padding: 0 },
  medDoseInput: { fontSize: 12, color: C.text2, fontFamily: fontFamily.regular, padding: 0, marginTop: 1 },
  medRemove: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  medDayRow: { flexDirection: 'row', gap: 5, marginTop: 10 },
  medDayChip: { flex: 1, height: 30, borderRadius: 8, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  medDayChipOn: { backgroundColor: C.accent },
  medDayChipText: { fontSize: 11, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text2 },
  medDayChipTextOn: { color: '#fff' },
  medDayHint: { fontSize: 11, color: C.muted, fontFamily: fontFamily.regular, marginTop: 6 },
  medAdd: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  medAddIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  medAddText: { fontSize: 14, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.accent },
})

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingBottom: 28 },
  handle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 15.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text, letterSpacing: -0.1 },
  subtitle: { fontSize: 12, color: C.text2, fontWeight: '500', fontFamily: fontFamily.medium, marginTop: 2 },
  saveBtn: {
    paddingHorizontal: 16, height: 34, borderRadius: 10, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', minWidth: 60,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 3,
  },
  saveBtnText: { fontSize: 13, fontWeight: '600', fontFamily: fontFamily.semibold, color: '#fff' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 6 },
  drumCol: { alignItems: 'center', gap: 6 },
  drumPicker: { width: 68 },
  drumLabel: { fontSize: 10.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  colon: { fontSize: 26, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text, marginBottom: 18, paddingHorizontal: 4 },
})
