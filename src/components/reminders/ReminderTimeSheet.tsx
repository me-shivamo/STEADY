import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, Modal,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import DrumPicker from '../common/DrumPicker'
import { fontFamily } from '../../theme/typography'

const C = {
  card:       '#FFFFFF',
  surface:    '#EEEDF4',
  accent:     '#6366F1',
  accentSoft: '#ECEAFE',
  text:       '#1D1D1F',
  text2:      '#6E6E73',
  muted:      '#A1A1A6',
  backdrop:   'rgba(0,0,0,0.38)',
} as const

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')) // '01'..'12'
const MINUTES  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const PERIODS  = ['AM', 'PM']

function formatTimeDisplay(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:${String(minute).padStart(2, '0')} ${period}`
}

function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number)
  return { hour: h, minute: m }
}

function formatTime24(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
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

interface Props {
  visible: boolean
  title: string
  currentTimes: string[] // "HH:mm" 24h, one entry per slot
  onSave: (times: string[]) => void
  onClose: () => void
}

export default function ReminderTimeSheet({ visible, title, currentTimes, onSave, onClose }: Props) {
  const [slotIndex, setSlotIndex] = useState(0)
  const [times, setTimes] = useState<string[]>(currentTimes)
  const [drumKey, setDrumKey] = useState(0)

  useEffect(() => {
    if (visible) {
      setTimes(currentTimes)
      setSlotIndex(0)
      setDrumKey((k) => k + 1)
    }
  }, [visible, currentTimes])

  const { hour, minute } = parseTime(times[slotIndex] ?? '08:00')
  const { hour12Index, periodIndex } = to12Hour(hour)

  // Takes the drum's own units (1-12 index, minute, AM/PM index) and converts
  // back to the 24h "HH:mm" string the store/DB actually use.
  const setSlotTime = (h12Index: number, m: number, pIndex: number) => {
    setTimes((prev) => {
      const next = [...prev]
      next[slotIndex] = formatTime24(to24Hour(h12Index, pIndex), m)
      return next
    })
  }

  const hasMultipleSlots = currentTimes.length > 1

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/*
        Plain View, not Pressable — on both the backdrop AND the sheet. A
        Pressable anywhere in this tree competes with the drum ScrollViews
        below for Android's touch-responder negotiation, and can win before a
        drag is ever recognized — reproduced on-device via a standalone
        Modal+DrumPicker test: freeze appeared specifically when the backdrop
        had a real onPress, and went away the moment it was a plain View.
        Tradeoff: this sheet can no longer be dismissed by tapping outside it
        — closing now only works via the Save/Close button or the Android
        back button (Modal's onRequestClose, still wired below).
      */}
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{formatTimeDisplay(hour, minute)}</Text>
            </View>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => onSave(times)}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          {hasMultipleSlots && (
            <View style={styles.slotRow}>
              {currentTimes.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.slotChip, i === slotIndex && styles.slotChipActive]}
                  onPress={() => { setSlotIndex(i); setDrumKey((k) => k + 1) }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotChipText, i === slotIndex && styles.slotChipTextActive]}>
                    Time {i + 1}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.timeRow}>
            <View style={styles.drumCol}>
              <DrumPicker
                key={`h-${drumKey}`}
                values={HOURS_12}
                selectedIndex={hour12Index}
                onIndexChange={(i) => setSlotTime(i, minute, periodIndex)}
                style={styles.drumPicker}
              />
              <Text style={styles.drumLabel}>Hour</Text>
            </View>

            <Text style={styles.colon}>:</Text>

            <View style={styles.drumCol}>
              <DrumPicker
                key={`m-${drumKey}`}
                values={MINUTES}
                selectedIndex={minute}
                onIndexChange={(i) => setSlotTime(hour12Index, i, periodIndex)}
                style={styles.drumPicker}
              />
              <Text style={styles.drumLabel}>Minute</Text>
            </View>

            {/* AM / PM drum — a real interactive picker, not a static label */}
            <View style={styles.drumCol}>
              <DrumPicker
                key={`p-${drumKey}`}
                values={PERIODS}
                selectedIndex={periodIndex}
                onIndexChange={(i) => setSlotTime(hour12Index, minute, i)}
                style={styles.drumPicker}
              />
              <Text style={styles.drumLabel}>Period</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: C.text2, fontWeight: '500', fontFamily: fontFamily.medium, marginTop: 2 },
  saveBtn: {
    paddingHorizontal: 18, height: 36, borderRadius: 10, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', minWidth: 64,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', fontFamily: fontFamily.bold, color: '#fff' },

  slotRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  slotChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surface },
  slotChipActive: { backgroundColor: C.accentSoft },
  slotChipText: { fontSize: 13, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text2 },
  slotChipTextActive: { color: C.accent },

  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 8,
  },
  drumCol: { alignItems: 'center', gap: 6 },
  drumPicker: { width: 72 },
  drumLabel: { fontSize: 11, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  colon: { fontSize: 30, fontWeight: '800', fontFamily: fontFamily.bold, color: C.text, marginBottom: 18, paddingHorizontal: 4 },
})
