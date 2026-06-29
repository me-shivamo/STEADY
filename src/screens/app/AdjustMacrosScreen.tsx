import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AppStackParamList } from '../../navigation/types'
import { useFoodLogStore, MacroOverride } from '../../store/foodLogStore'

// ── Design tokens — mirrors MealCard.tsx exactly ─────────────────────────────
const C = {
  bg:        '#F5F5F7',
  card:      '#FFFFFF',
  surface:   '#EEEDF4',
  accent:    '#6366F1',
  accentSoft:'#ECEAFE',
  text:      '#1D1D1F',
  text2:     '#6E6E73',
  muted:     '#A1A1A6',
  divider:   '#F2F2F7',
  protein:   '#2F6FED',
  carbs:     '#F5A623',
  fat:       '#9B51E0',
  error:     '#E53935',
} as const

type Props = NativeStackScreenProps<AppStackParamList, 'AdjustMacros'>

// One editable row of macro values for a single food entry.
// The user types plain numbers; we store them as strings in draft state
// so the TextInput stays fully controlled (including empty string while typing).
type EntryDraft = {
  id: string
  food_name: string
  quantity_label: string | null
  quantity_g: number
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
  // Whether this row's Supabase patch is in flight
  saving: boolean
  // Whether this row was saved successfully (shows a brief tick)
  saved: boolean
}

function toFixed(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n)) : '0'
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function formatQty(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`
}

function cleanQty(s: string): string {
  return s.replace(/[()]/g, '').trim()
}

// ── MacroField — one labelled TextInput inside a food entry card ──────────────
function MacroField({
  label, value, color, onChange, unit = '',
}: {
  label: string
  value: string
  color: string
  onChange: (v: string) => void
  unit?: string
}) {
  return (
    <View style={fieldStyles.wrap}>
      <View style={[fieldStyles.dot, { backgroundColor: color }]} />
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={fieldStyles.inputWrap}>
        <TextInput
          style={fieldStyles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          selectTextOnFocus
          maxLength={6}
          placeholderTextColor={C.muted}
        />
        {unit ? <Text style={fieldStyles.unit}>{unit}</Text> : null}
      </View>
    </View>
  )
}

const fieldStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 7, height: 7, borderRadius: 3.5,
  },
  label: {
    fontSize: 10.5, fontWeight: '600', color: C.text2, textAlign: 'center',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 5,
    minWidth: 54, justifyContent: 'center',
  },
  input: {
    fontSize: 14, fontWeight: '700', color: C.text,
    textAlign: 'center', minWidth: 32, padding: 0,
  },
  unit: {
    fontSize: 10, color: C.muted, marginLeft: 1,
  },
})

// ── AdjustMacrosScreen ────────────────────────────────────────────────────────
export default function AdjustMacrosScreen({ route, navigation }: Props) {
  const { mealId, mealName, entries: initialEntries } = route.params
  const updateEntryMacros = useFoodLogStore(s => s.updateEntryMacros)

  // Local draft state — one object per food entry.
  // Think of this as an array of "form rows", each independently editable.
  const [drafts, setDrafts] = useState<EntryDraft[]>(() =>
    initialEntries.map(e => ({
      id: e.id,
      food_name: e.food_name,
      quantity_label: e.quantity_label,
      quantity_g: e.quantity_g,
      calories:  toFixed(e.calories),
      protein_g: toFixed(e.protein_g),
      carbs_g:   toFixed(e.carbs_g),
      fat_g:     toFixed(e.fat_g),
      saving: false,
      saved: false,
    }))
  )

  const [isSavingAll, setIsSavingAll] = useState(false)

  // Update one field of one draft row — immutable map over the array.
  const updateDraft = useCallback(
    (id: string, field: keyof Pick<EntryDraft, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>, value: string) => {
      // Only allow digits and at most one decimal point
      const cleaned = value.replace(/[^0-9.]/g, '').replace(/(\.\d*)\./g, '$1')
      setDrafts(prev =>
        prev.map(d => d.id === id ? { ...d, [field]: cleaned } : d)
      )
    },
    []
  )

  // Parse a draft string to a number; fall back to 0 if invalid/empty.
  function parseMacro(s: string): number {
    const n = parseFloat(s)
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0
  }

  // Compute live totals from the current draft values so the summary
  // at the top of the screen updates as the user types.
  const liveTotals = drafts.reduce(
    (acc, d) => ({
      calories:  acc.calories  + parseMacro(d.calories),
      protein_g: acc.protein_g + parseMacro(d.protein_g),
      carbs_g:   acc.carbs_g   + parseMacro(d.carbs_g),
      fat_g:     acc.fat_g     + parseMacro(d.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  // Save all entries at once.
  const handleSaveAll = async () => {
    setIsSavingAll(true)
    try {
      await Promise.all(
        drafts.map(d =>
          updateEntryMacros(mealId, d.id, {
            calories:  parseMacro(d.calories),
            protein_g: parseMacro(d.protein_g),
            carbs_g:   parseMacro(d.carbs_g),
            fat_g:     parseMacro(d.fat_g),
          } as MacroOverride)
        )
      )
      // Mark all rows as saved
      setDrafts(prev => prev.map(d => ({ ...d, saved: true })))
      // Give the user a moment to see the success state, then pop back
      setTimeout(() => navigation.goBack(), 700)
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.')
    } finally {
      setIsSavingAll(false)
    }
  }

  const hasChanges = drafts.some((d, i) => {
    const orig = initialEntries[i]
    return (
      parseMacro(d.calories)  !== Math.round(orig.calories)  ||
      parseMacro(d.protein_g) !== Math.round(orig.protein_g) ||
      parseMacro(d.carbs_g)   !== Math.round(orig.carbs_g)   ||
      parseMacro(d.fat_g)     !== Math.round(orig.fat_g)
    )
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Adjust Macros</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{mealName}</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (!hasChanges || isSavingAll) && styles.saveBtnDisabled]}
          onPress={handleSaveAll}
          activeOpacity={0.8}
          disabled={!hasChanges || isSavingAll}
        >
          {isSavingAll
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Live totals summary card ─────────────────────────────────── */}
          <View style={styles.totalsCard}>
            <Text style={styles.totalsTitle}>Meal Totals</Text>
            <View style={styles.totalsRow}>
              <TotalCol label="Calories" value={Math.round(liveTotals.calories)} unit=""  color={C.accent} />
              <TotalCol label="Protein"  value={Math.round(liveTotals.protein_g)} unit="g" color={C.protein} />
              <TotalCol label="Carbs"    value={Math.round(liveTotals.carbs_g)}   unit="g" color={C.carbs} />
              <TotalCol label="Fat"      value={Math.round(liveTotals.fat_g)}     unit="g" color={C.fat} />
            </View>
          </View>

          {/* ── Info note ────────────────────────────────────────────────── */}
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={15} color={C.muted} />
            <Text style={styles.infoText}>
              Tap any value to edit it. Changes update your daily totals instantly.
            </Text>
          </View>

          {/* ── One card per food entry ──────────────────────────────────── */}
          {drafts.map((draft, idx) => (
            <View key={draft.id} style={styles.entryCard}>

              {/* Food name + quantity header */}
              <View style={styles.entryHeader}>
                <View style={styles.entryHeaderLeft}>
                  <Text style={styles.entryName} numberOfLines={2}>
                    {titleCase(draft.food_name)}
                  </Text>
                  <Text style={styles.entryQty}>
                    {cleanQty(draft.quantity_label ?? formatQty(draft.quantity_g))}
                  </Text>
                </View>
                {draft.saved && (
                  <View style={styles.savedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={C.accent} />
                    <Text style={styles.savedBadgeText}>Saved</Text>
                  </View>
                )}
              </View>

              <View style={styles.entryDivider} />

              {/* 4 macro fields in a row */}
              <View style={styles.macroFields}>
                <MacroField
                  label="Calories"
                  value={draft.calories}
                  color={C.accent}
                  onChange={v => updateDraft(draft.id, 'calories', v)}
                />
                <MacroField
                  label="Protein"
                  value={draft.protein_g}
                  color={C.protein}
                  unit="g"
                  onChange={v => updateDraft(draft.id, 'protein_g', v)}
                />
                <MacroField
                  label="Carbs"
                  value={draft.carbs_g}
                  color={C.carbs}
                  unit="g"
                  onChange={v => updateDraft(draft.id, 'carbs_g', v)}
                />
                <MacroField
                  label="Fat"
                  value={draft.fat_g}
                  color={C.fat}
                  unit="g"
                  onChange={v => updateDraft(draft.id, 'fat_g', v)}
                />
              </View>

            </View>
          ))}

          {/* ── Bottom save button (also reachable without scrolling back up) */}
          <TouchableOpacity
            style={[styles.bottomSaveBtn, (!hasChanges || isSavingAll) && styles.bottomSaveBtnDisabled]}
            onPress={handleSaveAll}
            activeOpacity={0.85}
            disabled={!hasChanges || isSavingAll}
          >
            {isSavingAll
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.bottomSaveBtnText}>Save Changes</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  )
}

// ── TotalCol — one column of the live totals card ────────────────────────────
function TotalCol({ label, value, unit, color }: {
  label: string; value: number; unit: string; color: string
}) {
  return (
    <View style={totalColStyles.col}>
      <View style={[totalColStyles.dot, { backgroundColor: color }]} />
      <Text style={totalColStyles.val}>{value}{unit}</Text>
      <Text style={totalColStyles.label}>{label}</Text>
    </View>
  )
}

const totalColStyles = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  val: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  label: { fontSize: 11, fontWeight: '500', color: C.text2 },
})

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    backgroundColor: C.bg,
    gap: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card,
    shadowColor: 'rgba(60,40,90,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  headerCenter: { flex: 1, paddingHorizontal: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  headerSub: { fontSize: 12.5, color: C.text2, fontWeight: '500', marginTop: 1 },
  saveBtn: {
    paddingHorizontal: 18, height: 36, borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
    minWidth: 64,
  },
  saveBtnDisabled: {
    backgroundColor: C.muted,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16, paddingBottom: 32, gap: 12,
  },

  // Live totals card
  totalsCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: 'rgba(60,40,90,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09, shadowRadius: 10, elevation: 4,
  },
  totalsTitle: {
    fontSize: 13, fontWeight: '700', color: C.text2, textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalsRow: {
    flexDirection: 'row', gap: 8,
  },

  // Info note
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: 4,
  },
  infoText: {
    flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 18,
  },

  // Entry card
  entryCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: 'rgba(60,40,90,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09, shadowRadius: 10, elevation: 4,
  },
  entryHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  entryHeaderLeft: { flex: 1, gap: 2 },
  entryName: {
    fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.1,
  },
  entryQty: {
    fontSize: 12.5, color: C.text2, fontWeight: '400',
  },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.accentSoft, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  savedBadgeText: { fontSize: 12, fontWeight: '600', color: C.accent },
  entryDivider: { height: 1, backgroundColor: C.surface, marginHorizontal: 0 },

  // 4-column macro field row
  macroFields: {
    flexDirection: 'row',
    paddingHorizontal: 12, paddingVertical: 14,
    gap: 8,
  },

  // Bottom save button
  bottomSaveBtn: {
    height: 52, borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  bottomSaveBtnDisabled: {
    backgroundColor: C.muted,
    shadowOpacity: 0, elevation: 0,
  },
  bottomSaveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})
