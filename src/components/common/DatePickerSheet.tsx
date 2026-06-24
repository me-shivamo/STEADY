import React, { useRef, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  Animated, StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { homeColors as C } from '../../theme/homeColors'

// ── Public API ────────────────────────────────────────────────────────────────

interface DatePickerSheetProps {
  visible: boolean
  selectedDate: string        // YYYY-MM-DD
  onSelectDate: (date: string) => void
}

// ── Date math helpers ─────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// Parse YYYY-MM-DD at noon local time to avoid UTC-midnight TZ rollback.
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00')
}

function isFuture(dateStr: string): boolean {
  return dateStr > todayStr()
}

function isToday(dateStr: string): boolean {
  return dateStr === todayStr()
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December']
const DAY_ABBRS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// ── MonthPills ────────────────────────────────────────────────────────────────

function MonthPills({ displayYear, displayMonth, todayYear, todayMonth, onSelect }: {
  displayYear: number
  displayMonth: number
  todayYear: number
  todayMonth: number
  onSelect: (year: number, month: number) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.pillsRow}
      style={s.pillsScroll}
    >
      {MONTH_NAMES.map((name, i) => {
        const isFutureMonth = displayYear > todayYear ||
          (displayYear === todayYear && i > todayMonth)
        const isActive = i === displayMonth

        return (
          <TouchableOpacity
            key={name}
            style={[s.pill, isActive && s.pillActive]}
            activeOpacity={isFutureMonth ? 1 : 0.7}
            onPress={isFutureMonth ? undefined : () => onSelect(displayYear, i)}
          >
            <Text style={[
              s.pillText,
              isActive && s.pillTextActive,
              isFutureMonth && s.mutedText,
            ]}>
              {name}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

function MonthGrid({ selectedDate, onSelectDate }: {
  selectedDate: string
  onSelectDate: (date: string) => void
}) {
  const todayD = parseDate(todayStr())
  const selD   = parseDate(selectedDate)

  const [displayYear, setDisplayYear]   = useState(selD.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(selD.getMonth())

  useEffect(() => {
    const d = parseDate(selectedDate)
    setDisplayYear(d.getFullYear())
    setDisplayMonth(d.getMonth())
  }, [selectedDate])

  const daysInMonth   = getDaysInMonth(displayYear, displayMonth)
  const firstDayOfWk  = getFirstDayOfWeek(displayYear, displayMonth)

  const canGoNext = displayYear < todayD.getFullYear() ||
    (displayYear === todayD.getFullYear() && displayMonth < todayD.getMonth())

  const goPrev = () => {
    if (displayMonth === 0) { setDisplayYear(y => y - 1); setDisplayMonth(11) }
    else setDisplayMonth(m => m - 1)
  }
  const goNext = () => {
    if (!canGoNext) return
    if (displayMonth === 11) { setDisplayYear(y => y + 1); setDisplayMonth(0) }
    else setDisplayMonth(m => m + 1)
  }

  const cells: Array<number | null> = [
    ...Array(firstDayOfWk).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <View>
      {/* Month nav */}
      <View style={s.monthNav}>
        <TouchableOpacity onPress={goPrev} style={s.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={16} color={C.text2} />
        </TouchableOpacity>
        <Text style={s.monthNavTitle}>
          {MONTH_NAMES_LONG[displayMonth]} {displayYear}
        </Text>
        <TouchableOpacity onPress={goNext} style={s.navBtn} activeOpacity={canGoNext ? 0.7 : 1}>
          <Ionicons name="chevron-forward" size={16} color={canGoNext ? C.text2 : C.muted} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week header */}
      <View style={s.dowRow}>
        {DAY_ABBRS.map((abbr, i) => (
          <View key={i} style={s.dowCell}>
            <Text style={s.dowText}>{abbr}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View style={s.gridWrap}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={`b${idx}`} style={s.gridCell} />

          const dateStr  = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const future   = isFuture(dateStr)
          const selected = dateStr === selectedDate
          const todayCell = isToday(dateStr)

          return (
            <TouchableOpacity
              key={dateStr}
              style={s.gridCell}
              activeOpacity={future ? 1 : 0.7}
              onPress={future ? undefined : () => onSelectDate(dateStr)}
            >
              <View style={[
                s.gridCellInner,
                selected && s.selectedCircle,
                !selected && todayCell && s.todayCircle,
              ]}>
                <Text style={[
                  s.gridDayNum,
                  selected && s.selectedText,
                  !selected && future && s.mutedText,
                ]}>
                  {day}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Month pills */}
      <MonthPills
        displayYear={displayYear}
        displayMonth={displayMonth}
        todayYear={todayD.getFullYear()}
        todayMonth={todayD.getMonth()}
        onSelect={(y, m) => { setDisplayYear(y); setDisplayMonth(m) }}
      />
    </View>
  )
}

// ── DatePickerSheet ───────────────────────────────────────────────────────────

// Large enough to never clip any month layout; actual height is content-driven.
const MAX_HEIGHT_OPEN = 600

export default function DatePickerSheet({ visible, selectedDate, onSelectDate }: DatePickerSheetProps) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 240,
      useNativeDriver: false,   // maxHeight is a layout prop — cannot use native driver
    }).start()
  }, [visible])

  const animHeight = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, MAX_HEIGHT_OPEN],
  })

  return (
    <View style={s.shadowWrap}>
      <Animated.View style={[s.container, { maxHeight: animHeight }]}>
        <MonthGrid selectedDate={selectedDate} onSelectDate={onSelectDate} />
      </Animated.View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Outer wrapper carries the shadow + radius (shadow is clipped by overflow:hidden)
  shadowWrap: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    backgroundColor: C.card,
    marginHorizontal: -20,  // bleed to screen edges (scrollContent has 20px padding)
    marginBottom: 6,        // gap between calendar card and calorie ring card
  },
  // Inner animated view clips the content as it expands
  container: {
    overflow: 'hidden',
    backgroundColor: C.card,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  // Month nav
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  navBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    letterSpacing: 0.1,
  },

  // Day-of-week header
  dowRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  dowCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dowText: {
    fontSize: 11,
    fontWeight: '500',
    color: C.muted,
  },

  // Day grid — no fixed height, cells are compact
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  gridCell: {
    width: '14.285714%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  gridCellInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDayNum: {
    fontSize: 13,
    fontWeight: '400',
    color: C.text,
  },

  // Month pills — outlined chips, natural sizing
  pillsScroll: {
    marginTop: 8,
    marginBottom: 14,
  },
  pillsRow: {
    paddingHorizontal: 12,
    gap: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  pillActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.text2,
  },
  pillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // State styles
  selectedCircle: { backgroundColor: C.accent },
  todayCircle: { borderWidth: 1, borderColor: C.border },
  selectedText: { color: '#fff', fontWeight: '600' },
  mutedText: { color: C.muted },
})
