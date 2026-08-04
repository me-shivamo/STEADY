import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, Modal,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { MonthGrid } from './DatePickerSheet'
import DrumPicker from './DrumPicker'
import { useFoodLogStore } from '../../store/foodLogStore'
import { fontFamily } from '../../theme/typography'
import { todayLocalDate } from '../../utils/localDate'
import { toUserMessage } from '../../utils/errors'
import { toast } from '../../store/toastStore'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  card:       '#FFFFFF',
  surface:    '#EEEDF4',
  accent:     '#6366F1',
  accentSoft: '#ECEAFE',
  text:       '#1D1D1F',
  text2:      '#6E6E73',
  muted:      '#A1A1A6',
  divider:    '#F2F2F7',
  backdrop:   'rgba(0,0,0,0.38)',
} as const

function todayStr(): string {
  return todayLocalDate()
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')) // '01'..'12'
const MINUTES   = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const PERIODS   = ['AM', 'PM']

function formatTimeDisplay(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:${String(minute).padStart(2, '0')} ${period}`
}

// 24h hour (0-23) -> { hour12Index (0-11, i.e. 1..12), periodIndex (0=AM, 1=PM) }
function to12Hour(hour24: number): { hour12Index: number; periodIndex: number } {
  const periodIndex = hour24 < 12 ? 0 : 1
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { hour12Index: hour12 - 1, periodIndex }
}

// { hour12Index (0-11), periodIndex (0=AM, 1=PM) } -> 24h hour (0-23)
function to24Hour(hour12Index: number, periodIndex: number): number {
  const hour12 = hour12Index + 1 // 1..12
  if (periodIndex === 0) return hour12 === 12 ? 0 : hour12   // AM
  return hour12 === 12 ? 12 : hour12 + 12                    // PM
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  mealId: string
  currentDate: string
  currentCreatedAt: string
  onClose: () => void
}

// ── ChangeDateTimeSheet ───────────────────────────────────────────────────────

export default function ChangeDateTimeSheet({
  visible, mealId, currentDate, currentCreatedAt, onClose,
}: Props) {
  const updateMealDateTime = useFoodLogStore(s => s.updateMealDateTime)

  const [originalDate,   setOriginalDate]   = useState(currentDate)
  const [originalHour12, setOriginalHour12] = useState(() => to12Hour(new Date(currentCreatedAt).getHours()).hour12Index)
  const [originalPeriod, setOriginalPeriod] = useState(() => to12Hour(new Date(currentCreatedAt).getHours()).periodIndex)
  const [originalMinute, setOriginalMinute] = useState(() => new Date(currentCreatedAt).getMinutes())

  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [hour12Index,  setHour12Index]  = useState(() => to12Hour(new Date(currentCreatedAt).getHours()).hour12Index)
  const [periodIndex,  setPeriodIndex]  = useState(() => to12Hour(new Date(currentCreatedAt).getHours()).periodIndex)
  const [minuteIndex,  setMinuteIndex]  = useState(() => new Date(currentCreatedAt).getMinutes())
  const [saving,       setSaving]       = useState(false)

  // drumKey forces DrumPicker to remount on each open, since it only seeds its
  // scroll position from `selectedIndex` on mount (via contentOffset), not on
  // every prop change — remounting re-seeds it at the correct index.
  const [drumKey, setDrumKey] = useState(0)

  const handleOpen = useCallback(() => {
    const d = new Date(currentCreatedAt)
    const { hour12Index: h12, periodIndex: p } = to12Hour(d.getHours())
    const m = d.getMinutes()
    setSelectedDate(currentDate)
    setHour12Index(h12)
    setPeriodIndex(p)
    setMinuteIndex(m)
    setOriginalDate(currentDate)
    setOriginalHour12(h12)
    setOriginalPeriod(p)
    setOriginalMinute(m)
    setDrumKey(k => k + 1)
  }, [currentDate, currentCreatedAt])

  function buildISOTimestamp(date: string, hour24: number, minute: number): string {
    return `${date}T${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  }

  const hasChanged =
    selectedDate !== originalDate ||
    hour12Index  !== originalHour12 ||
    periodIndex  !== originalPeriod ||
    minuteIndex  !== originalMinute

  const handleSave = async () => {
    if (!hasChanged) { onClose(); return }
    if (selectedDate > todayStr()) {
      Alert.alert("Can't set a future date", 'Meals can only be logged on today or past dates.')
      return
    }
    setSaving(true)
    try {
      const hour24 = to24Hour(hour12Index, periodIndex)
      await updateMealDateTime(mealId, selectedDate, buildISOTimestamp(selectedDate, hour24, minuteIndex))
      onClose()
    } catch (err: any) {
      toast.error(toUserMessage(err, 'editMeal'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      {/*
        Plain View, not Pressable — on both the backdrop AND the sheet. A
        Pressable anywhere in this tree competes with the drum ScrollViews
        below for Android's touch-responder negotiation, and can win before a
        drag is ever recognized — reproduced on-device via a standalone
        Modal+DrumPicker test: freeze appeared specifically when the backdrop
        had a real onPress, and went away the moment it was a plain View.
        Tradeoff: this sheet can no longer be dismissed by tapping outside it
        — closing now only works via the Save button or the Android back
        button (Modal's onRequestClose, still wired above).
      */}
      <View style={styles.backdrop}>
        <View style={styles.sheet}>

          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Change Date & Time</Text>
              <Text style={styles.subtitle}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric',
                })}{' · '}{formatTimeDisplay(to24Hour(hour12Index, periodIndex), minuteIndex)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, (!hasChanged || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          {/*
            Plain View, not a ScrollView: the old version nested a vertical
            ScrollView (this one) around more vertical ScrollViews (the time
            drums below), and two nested vertical scrollers fighting over the
            same gesture is exactly what made the drums feel frozen/unresponsive
            on Android — the outer scroller was winning the touch, not the drum.
            Content here (a calendar grid + one row of drums) is a fixed height
            well under the sheet's 92% max, so scrolling was never needed.
          */}
          <View style={styles.scrollContent}>
            {/* ── Date section ────────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar-outline" size={15} color={C.accent} />
              <Text style={styles.sectionTitle}>Date</Text>
            </View>
            <MonthGrid selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            <View style={styles.divider} />

            {/* ── Time section ────────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={15} color={C.accent} />
              <Text style={styles.sectionTitle}>Time</Text>
            </View>

            <View style={styles.timeRow}>
              {/* Hour drum (12h) */}
              <View style={styles.drumCol}>
                <DrumPicker
                  key={`h-${drumKey}`}
                  values={HOURS_12}
                  selectedIndex={hour12Index}
                  onIndexChange={setHour12Index}
                  style={styles.drumPicker}
                />
                <Text style={styles.drumLabel}>Hour</Text>
              </View>

              <Text style={styles.colon}>:</Text>

              {/* Minute drum */}
              <View style={styles.drumCol}>
                <DrumPicker
                  key={`m-${drumKey}`}
                  values={MINUTES}
                  selectedIndex={minuteIndex}
                  onIndexChange={setMinuteIndex}
                  style={styles.drumPicker}
                />
                <Text style={styles.drumLabel}>Minute</Text>
              </View>

              {/* AM / PM drum — a real interactive picker, not just a label */}
              <View style={styles.drumCol}>
                <DrumPicker
                  key={`p-${drumKey}`}
                  values={PERIODS}
                  selectedIndex={periodIndex}
                  onIndexChange={setPeriodIndex}
                  style={styles.drumPicker}
                />
                <Text style={styles.drumLabel}>Period</Text>
              </View>
            </View>

          </View>

        </View>
      </View>
    </Modal>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: C.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: '92%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D1D6',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: C.text2, fontWeight: '500', fontFamily: fontFamily.medium, marginTop: 2 },
  saveBtn: {
    paddingHorizontal: 18, height: 36, borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 64,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  saveBtnDisabled: { backgroundColor: C.muted, shadowOpacity: 0, elevation: 0 },
  saveBtnText: { fontSize: 14, fontWeight: '700', fontFamily: fontFamily.bold, color: '#fff' },

  scrollContent: { paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text2,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  divider: {
    height: 1, backgroundColor: C.surface,
    marginHorizontal: 20, marginVertical: 8,
  },

  // Time picker
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  drumCol: { alignItems: 'center', gap: 6 },
  drumPicker: { width: 72 },
  drumLabel: {
    fontSize: 11, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  colon: {
    fontSize: 30, fontWeight: '800', fontFamily: fontFamily.bold, color: C.text,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
})
