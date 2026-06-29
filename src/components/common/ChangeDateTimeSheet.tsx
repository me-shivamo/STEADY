import React, { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, Modal, Pressable,
  TouchableOpacity, ActivityIndicator, Alert,
  ScrollView, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { MonthGrid } from './DatePickerSheet'
import { useFoodLogStore } from '../../store/foodLogStore'

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

const ITEM_H = 48   // height of each drum row
const VISIBLE = 3   // how many rows are visible at once
const DRUM_H  = ITEM_H * VISIBLE

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function formatTimeDisplay(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:${String(minute).padStart(2, '0')} ${period}`
}

// ── SimpleDrum — plain ScrollView drum, no Animated/native driver ─────────────
// Works reliably inside Modals on Android because it runs entirely on the JS
// thread. DrumPicker's Animated approach fails inside Modals on Android because
// the native thread hasn't fully laid out when contentOffset fires.
function SimpleDrum({
  values,
  selectedIndex,
  onIndexChange,
}: {
  values: string[]
  selectedIndex: number
  onIndexChange: (i: number) => void
}) {
  const ref = useRef<ScrollView>(null)

  // Scroll to the selected item when the ref is first attached (on mount).
  const onLayout = useCallback(() => {
    ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false })
  }, [selectedIndex])

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM_H)))
      onIndexChange(idx)
    },
    [values.length, onIndexChange]
  )

  return (
    <View style={drumStyles.wrap}>
      {/* Selection highlight band */}
      <View style={drumStyles.band} pointerEvents="none" />

      <ScrollView
        ref={ref}
        style={drumStyles.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        onLayout={onLayout}
        nestedScrollEnabled
        contentContainerStyle={{
          paddingVertical: ITEM_H, // top+bottom padding centres item 0 in the band
        }}
      >
        {values.map((val, i) => {
          const isSelected = i === selectedIndex
          return (
            <View key={val} style={drumStyles.item}>
              <Text style={[drumStyles.itemText, isSelected && drumStyles.itemTextSelected]}>
                {val}
              </Text>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const drumStyles = StyleSheet.create({
  wrap: {
    height: DRUM_H,
    overflow: 'hidden',
    position: 'relative',
    width: 72,
  },
  band: {
    position: 'absolute',
    top: ITEM_H,           // middle slot
    left: 0, right: 0,
    height: ITEM_H,
    backgroundColor: C.accentSoft,
    borderRadius: 10,
    zIndex: 0,
  },
  scroll: { width: '100%' },
  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 24,
    fontWeight: '600',
    color: C.muted,
  },
  itemTextSelected: {
    color: C.text,
    fontWeight: '800',
  },
})

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
  const [originalHour,   setOriginalHour]   = useState(() => new Date(currentCreatedAt).getHours())
  const [originalMinute, setOriginalMinute] = useState(() => new Date(currentCreatedAt).getMinutes())

  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [hourIndex,    setHourIndex]    = useState(() => new Date(currentCreatedAt).getHours())
  const [minuteIndex,  setMinuteIndex]  = useState(() => new Date(currentCreatedAt).getMinutes())
  const [saving,       setSaving]       = useState(false)

  // drumKey forces SimpleDrum to remount on each open so onLayout re-fires
  // and scrollTo positions the drum at the correct index.
  const [drumKey, setDrumKey] = useState(0)

  const handleOpen = useCallback(() => {
    const d = new Date(currentCreatedAt)
    const h = d.getHours()
    const m = d.getMinutes()
    setSelectedDate(currentDate)
    setHourIndex(h)
    setMinuteIndex(m)
    setOriginalDate(currentDate)
    setOriginalHour(h)
    setOriginalMinute(m)
    setDrumKey(k => k + 1)
  }, [currentDate, currentCreatedAt])

  function buildISOTimestamp(date: string, hour: number, minute: number): string {
    return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  }

  const hasChanged =
    selectedDate !== originalDate ||
    hourIndex    !== originalHour ||
    minuteIndex  !== originalMinute

  const handleSave = async () => {
    if (!hasChanged) { onClose(); return }
    if (selectedDate > todayStr()) {
      Alert.alert("Can't set a future date", 'Meals can only be logged on today or past dates.')
      return
    }
    setSaving(true)
    try {
      await updateMealDateTime(mealId, selectedDate, buildISOTimestamp(selectedDate, hourIndex, minuteIndex))
      onClose()
    } catch (err: any) {
      Alert.alert('Could not update', err?.message ?? 'Please try again.')
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>

          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Change Date & Time</Text>
              <Text style={styles.subtitle}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric',
                })}{' · '}{formatTimeDisplay(hourIndex, minuteIndex)}
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
          >
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
              {/* Hour drum */}
              <View style={styles.drumCol}>
                <SimpleDrum
                  key={`h-${drumKey}`}
                  values={HOURS}
                  selectedIndex={hourIndex}
                  onIndexChange={setHourIndex}
                />
                <Text style={styles.drumLabel}>Hour</Text>
              </View>

              <Text style={styles.colon}>:</Text>

              {/* Minute drum */}
              <View style={styles.drumCol}>
                <SimpleDrum
                  key={`m-${drumKey}`}
                  values={MINUTES}
                  selectedIndex={minuteIndex}
                  onIndexChange={setMinuteIndex}
                />
                <Text style={styles.drumLabel}>Minute</Text>
              </View>

              {/* AM / PM badge */}
              <View style={styles.periodBadge}>
                <Text style={styles.periodText}>
                  {hourIndex < 12 ? 'AM' : 'PM'}
                </Text>
              </View>
            </View>

          </ScrollView>

        </Pressable>
      </Pressable>
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
  title: { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: C.text2, fontWeight: '500', marginTop: 2 },
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
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  scrollContent: { paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: C.text2,
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
  drumLabel: {
    fontSize: 11, fontWeight: '600', color: C.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  colon: {
    fontSize: 30, fontWeight: '800', color: C.text,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  periodBadge: {
    backgroundColor: C.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 18, marginLeft: 4,
  },
  periodText: { fontSize: 15, fontWeight: '700', color: C.accent },
})
