import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  TextInput, ActivityIndicator, Alert, Modal, Pressable,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AppStackParamList } from '../../navigation/types'
import { MealCard as MealCardType, useFoodLogStore } from '../../store/foodLogStore'
import { useAuthStore } from '../../store/authStore'
import ChangeDateTimeSheet from '../common/ChangeDateTimeSheet'

type NavProp = NativeStackNavigationProp<AppStackParamList>

// ── Design tokens (from Claude Design) ───────────────────────────────────────
const C = {
  card: '#FFFFFF',
  surface: '#EEEDF4',
  accent: '#6366F1',
  accentSoft: '#ECEAFE',
  text: '#1D1D1F',
  ink: '#1A1A1A', // 10% off pure black — shared color for meal name + quantity
  text2: '#6E6E73',
  muted: '#A1A1A6',
  protein: '#2F6FED',
  carbs: '#F5A623',
  fat: '#9B51E0',
} as const

interface Props {
  meal: MealCardType
  onEdit?: () => void
  onOptions?: () => void
  // Called when the user opens the inline editor so the parent ScrollView
  // can scroll this card into view above the keyboard.
  onEditStart?: () => void
}

// Human-readable grams fallback when a food entry has no quantity_label.
function formatQty(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${Math.round(grams)} g`
}

// Capitalise the first letter of each word — AI returns lowercase food names.
function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

// The AI sometimes bakes its own brackets into quantity_label (e.g. "2 spoon (30g)").
// We always wrap the quantity in our own ( ), so strip any inner brackets to avoid
// double brackets like "(2 spoon (30g))" → "(2 spoon 30g)".
function cleanQty(s: string): string {
  return s.replace(/[()]/g, '').trim()
}

// ── LogCard — gray input line · per-food rows · total grid · footer ───────────
// Build a human-readable summary of AI-parsed foods, e.g.
// "Bread (2 slices), Tomato (42 g), Egg (2 large)"
// This is what the user edits — it reflects what the AI understood, not their raw input.
function buildFoodSummary(entries: MealCardType['entries']): string {
  return entries
    .map(e => `${titleCase(e.food_name)} (${cleanQty(e.quantity_label ?? formatQty(e.quantity_g))})`)
    .join(', ')
}

export default function MealCard({ meal, onEdit, onOptions, onEditStart }: Props) {
  const navigation = useNavigation<NavProp>()
  const { profile } = useAuthStore()
  const editMealFromText = useFoodLogStore(s => s.editMealFromText)
  const deleteMeal       = useFoodLogStore(s => s.deleteMeal)

  // ── Per-card edit state (local UI state — no other screen cares about it) ──
  const [isEditing,    setIsEditing]    = useState(false)
  const [draft,        setDraft]        = useState('')
  const [isSaving,     setIsSaving]     = useState(false)
  const [showOptions,  setShowOptions]  = useState(false)
  const [showDateTime, setShowDateTime] = useState(false)

  const startEdit = () => {
    setShowOptions(false)
    setDraft(buildFoodSummary(meal.entries))
    setIsEditing(true)
    onEditStart?.()
  }
  const cancelEdit = () => setIsEditing(false)

  const handleDelete = () => {
    setShowOptions(false)
    Alert.alert(
      'Delete meal?',
      'This will permanently remove this entry and its macros from today.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteMeal(meal.id)
            } catch {
              Alert.alert('Error', 'Could not delete. Please try again.')
            }
          },
        },
      ],
    )
  }

  const confirmEdit = async () => {
    const text = draft.trim()
    if (!text || text === (meal.input_text ?? '')) {
      // Nothing changed (or empty) — just exit edit mode, skip the AI call.
      setIsEditing(false)
      return
    }
    setIsEditing(false)
    setIsSaving(true)
    try {
      await editMealFromText(meal.id, text)
      // On success the store swaps this card's data via props → re-render.
    } catch (err: any) {
      Alert.alert('Couldn’t update', err?.message ?? 'Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // Compute totals from individual food entries
  const totals = meal.entries.reduce(
    (acc, e) => ({
      calories:  acc.calories  + (e.calories  ?? 0),
      protein_g: acc.protein_g + (e.protein_g ?? 0),
      carbs_g:   acc.carbs_g   + (e.carbs_g   ?? 0),
      fat_g:     acc.fat_g     + (e.fat_g     ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  // Daily goals (for percentage calculation)
  const calorieGoal = profile?.calorie_goal   ?? 2000
  const proteinGoal = profile?.protein_goal_g  ?? 150
  const carbGoal    = profile?.carb_goal_g     ?? 200
  const fatGoal     = profile?.fat_goal_g      ?? 60

  // 4-column macro data — order matches design: Calories | Carbs | Protein | Fat
  const cols = [
    { label: 'Calories', val: Math.round(totals.calories),  unit: '',  pct: Math.round(totals.calories  / calorieGoal * 100), color: C.accent },
    { label: 'Carbs',    val: Math.round(totals.carbs_g),   unit: 'g', pct: Math.round(totals.carbs_g   / carbGoal    * 100), color: C.carbs },
    { label: 'Protein',  val: Math.round(totals.protein_g), unit: 'g', pct: Math.round(totals.protein_g / proteinGoal * 100), color: C.protein },
    { label: 'Fat',      val: Math.round(totals.fat_g),     unit: 'g', pct: Math.round(totals.fat_g     / fatGoal     * 100), color: C.fat },
  ]

  const time = meal.created_at
    ? new Date(meal.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <View style={styles.card}>

      {/* ── Optional photo — shown ONLY when the user uploaded one ─────────── */}
      {meal.photo_url ? (
        <Image source={{ uri: meal.photo_url }} style={styles.photo} />
      ) : null}

      <View style={styles.body}>

        {/* ── User-input line — editable when in edit mode ─────────────────── */}
        {isEditing ? (
          /* Row: [TextInput flex:1] [✓] [✕]  — icons sit right of the input box */
          <View style={styles.inputEditRow}>
            <TextInput
              style={styles.inputEdit}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
              placeholder="Edit your food list…"
              placeholderTextColor={C.muted}
              editable={!isSaving}
            />
            <TouchableOpacity style={styles.editActionBtn} onPress={confirmEdit} activeOpacity={0.7}>
              <Ionicons name="checkmark" size={20} color={C.accent} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.editActionBtn} onPress={cancelEdit} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>
        ) : meal.input_text ? (
          <Text style={styles.inputText}>{meal.input_text}</Text>
        ) : null}

        {/* ── Per-food rows: name (quantity) + plain macro line ───────────── */}
        {meal.entries.map((e, i) => (
          <View
            key={e.id ?? i}
            style={[styles.foodRow, i > 0 && styles.foodRowDivider]}
          >
            <Text style={styles.foodName} numberOfLines={2}>
              {titleCase(e.food_name)}{' '}
              <Text style={styles.foodQty}>
                ({cleanQty(e.quantity_label ?? formatQty(e.quantity_g))})
              </Text>
            </Text>
            <View style={styles.macroRow}>
              <View style={styles.macroChip}>
                <Text style={styles.macroChipText}>Calories: {Math.round(e.calories ?? 0)}</Text>
              </View>
              <View style={styles.macroChip}>
                <Text style={styles.macroChipText}>Carbs: {Math.round(e.carbs_g ?? 0)}g</Text>
              </View>
              <View style={styles.macroChip}>
                <Text style={styles.macroChipText}>Protein: {Math.round(e.protein_g ?? 0)}g</Text>
              </View>
              <View style={styles.macroChip}>
                <Text style={styles.macroChipText}>Fat: {Math.round(e.fat_g ?? 0)}g</Text>
              </View>
            </View>
          </View>
        ))}

      </View>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {isSaving ? (
        /* ── Re-evaluation in flight: the card locks and shows progress ───── */
        <View style={styles.analyzingRow}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.analyzingText}>Analyzing…</Text>
        </View>
      ) : (
        /* ── Total macro grid (the whole meal) ───────────────────────────── */
        <View style={styles.macroGrid}>
          {cols.map((col, i) => (
            <View key={i} style={styles.macroCol}>
              <Text style={styles.macroColLabel}>{col.label}</Text>
              <Text style={styles.macroColVal}>{col.val}{col.unit}</Text>
              <View style={styles.macroBar}>
                <View style={[
                  styles.macroBarFill,
                  { width: `${Math.min(col.pct, 100)}%` as any, backgroundColor: col.color },
                ]} />
              </View>
              <Text style={styles.macroColPct}>{col.pct}%</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Footer: timestamp · actions (hidden while analyzing) ──────────── */}
      {!isSaving && (
        <View style={styles.footerRow}>
          <Text style={styles.timeText}>{time}</Text>
          {/* Edit/options only shown in read mode — in edit mode ✓/✕ sit inline next to the input */}
          {!isEditing && (
            <View style={styles.footerActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={onEdit ?? startEdit} activeOpacity={0.7}>
                <Ionicons name="create" size={18} color={C.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={onOptions ?? (() => setShowOptions(true))} activeOpacity={0.7}>
                <Ionicons name="ellipsis-vertical" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── Options bottom sheet ─────────────────────────────────────────── */}
      <Modal
        visible={showOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptions(false)}
      >
        {/* Semi-transparent backdrop — tap it to dismiss */}
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowOptions(false)}>
          {/* Stop taps on the sheet panel from closing the modal */}
          <Pressable style={styles.sheetPanel} onPress={e => e.stopPropagation()}>

            {/* Drag handle */}
            <View style={styles.sheetHandle} />

            {/* Edit Entry */}
            <TouchableOpacity style={styles.sheetRow} onPress={startEdit} activeOpacity={0.7}>
              <Ionicons name="create-outline" size={22} color={C.text} />
              <Text style={styles.sheetRowText}>Edit Entry</Text>
            </TouchableOpacity>

            {/* Adjust Calories & Macros */}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setShowOptions(false)
                navigation.navigate('AdjustMacros', {
                  mealId: meal.id,
                  mealName: meal.meal_name,
                  entries: meal.entries.map(e => ({
                    id: e.id ?? '',
                    food_name: e.food_name,
                    quantity_label: e.quantity_label ?? null,
                    quantity_g: e.quantity_g,
                    calories: e.calories ?? 0,
                    protein_g: e.protein_g ?? 0,
                    carbs_g: e.carbs_g ?? 0,
                    fat_g: e.fat_g ?? 0,
                  })),
                })
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="options-outline" size={22} color={C.text} />
              <Text style={styles.sheetRowText}>Adjust Calories & Macros</Text>
            </TouchableOpacity>

            {/* Change Date & Time */}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => { setShowOptions(false); setShowDateTime(true) }}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={22} color={C.text} />
              <Text style={styles.sheetRowText}>Change Date & Time</Text>
            </TouchableOpacity>

            {/* Add to Saved Entries — coming soon */}
            <TouchableOpacity style={styles.sheetRow} onPress={() => { setShowOptions(false); Alert.alert('Coming soon', 'Saved entries (meal templates) are coming in a future update.') }} activeOpacity={0.7}>
              <Ionicons name="bookmark-outline" size={22} color={C.text} />
              <Text style={styles.sheetRowText}>Add to Saved Entries</Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity style={styles.sheetRow} onPress={handleDelete} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={22} color="#E53935" />
              <Text style={[styles.sheetRowText, { color: '#E53935' }]}>Delete</Text>
            </TouchableOpacity>

          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Change Date & Time sheet ─────────────────────────────────────── */}
      <ChangeDateTimeSheet
        visible={showDateTime}
        mealId={meal.id}
        currentDate={meal.logged_date}
        currentCreatedAt={meal.created_at}
        onClose={() => setShowDateTime(false)}
      />

    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: 'rgba(60,40,90,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 4,
  },

  // Optional uploaded photo (full-width banner above the body)
  photo: {
    width: '100%',
    height: 130,
    backgroundColor: C.surface,
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },

  // Faded gray line = the user's raw typed text
  inputText: {
    fontSize: 11.5,
    color: C.muted,
    marginBottom: 4,
  },

  // Editable version of the input line (edit mode) — row contains input + ✓/✕
  inputEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 2,
  },
  inputEdit: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: C.surface,
    borderRadius: 8,
  },
  // ✓ and ✕ buttons sitting to the right of the TextInput in edit mode
  editActionBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginTop: 2,
  },

  // "Analyzing…" row shown while the edit is being re-evaluated
  analyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  analyzingText: {
    fontSize: 13,
    color: C.text2,
    fontWeight: '500',
  },

  // Per-food row
  foodRow: {
    paddingVertical: 4,
  },
  foodRowDivider: {
    borderTopWidth: 1,
    borderTopColor: C.surface,
  },
  foodName: {
    fontSize: 14,
    fontWeight: '400',
    color: C.ink,
    marginBottom: 3,
  },
  foodQty: {
    color: C.ink,
    fontWeight: '400',
  },

  // Macros under each food — each value in its own content-sized light-grey chip
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  macroChip: {
    backgroundColor: C.surface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  macroChipText: {
    fontSize: 9.5,
    color: C.text2,
    fontWeight: '400',
  },

  // Divider before the total grid
  divider: {
    height: 1,
    backgroundColor: C.surface,
    marginTop: 6,
  },

  // Macro grid — 4 equal columns (meal total)
  macroGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 10,
  },
  macroCol: { flex: 1 },
  macroColLabel: {
    fontSize: 11.5, color: C.text2, fontWeight: '500',
  },
  macroColVal: {
    fontSize: 15.5, fontWeight: '700', color: C.text,
    marginTop: 1, marginBottom: 3,
  },
  macroBar: {
    height: 4, borderRadius: 2,
    backgroundColor: C.surface, overflow: 'hidden',
  },
  macroBarFill: { height: '100%', borderRadius: 2 },
  macroColPct: {
    fontSize: 10.5, color: C.muted, marginTop: 2,
  },

  // Footer — time + actions
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: C.surface,
  },
  timeText: { fontSize: 11.5, color: C.muted },
  footerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Options bottom sheet ───────────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D1D6',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  sheetRowText: {
    fontSize: 16,
    fontWeight: '500',
    color: C.text,
  },
})
