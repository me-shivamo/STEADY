import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { fontFamily } from '../../theme/typography'
import { useSavedEntriesStore, SavedEntry } from '../../store/savedEntriesStore'
import ConfirmSheet from '../common/ConfirmSheet'

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

interface Props {
  visible: boolean
  onClose: () => void
  onSelect: (entryId: string) => void
}

function macroSummary(entry: SavedEntry): string {
  const totals = entry.entries.reduce(
    (acc, e) => ({ calories: acc.calories + (e.calories ?? 0) }),
    { calories: 0 }
  )
  const itemCount = entry.entries.length
  return `${Math.round(totals.calories)} kcal · ${itemCount} item${itemCount === 1 ? '' : 's'}`
}

// SavedEntriesSheet — a bottom sheet listing the user's saved meal templates,
// for the quick-log flow from the Home composer. Follows the same Modal +
// backdrop-Pressable pattern as ConfirmSheet/ChangeDateTimeSheet.
export default function SavedEntriesSheet({ visible, onClose, onSelect }: Props) {
  const { entries, loading, fetchSavedEntries, deleteSavedEntry } = useSavedEntriesStore()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (visible) fetchSavedEntries()
  }, [visible])

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    await deleteSavedEntry(deleteTargetId)
    setDeleting(false)
    setDeleteTargetId(null)
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <Text style={styles.title}>Saved Entries</Text>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : entries.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="bookmark-outline" size={32} color={C.muted} />
                <Text style={styles.emptyText}>
                  No saved entries yet. Save a meal from its options menu to see it here.
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {entries.map((entry) => (
                  <View key={entry.id} style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowMain}
                      onPress={() => { onSelect(entry.id); onClose() }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.rowIcon}>
                        <Ionicons name="bookmark" size={16} color={C.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>{entry.name}</Text>
                        <Text style={styles.rowMacros}>{macroSummary(entry)}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rowDelete}
                      onPress={() => setDeleteTargetId(entry.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmSheet
        visible={deleteTargetId !== null}
        title="Delete saved entry?"
        message="This won't affect any meals you've already logged with it."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </>
  )
}

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
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D1D6',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 17, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text,
    letterSpacing: -0.2,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13, fontFamily: fontFamily.regular, color: C.muted,
    textAlign: 'center', lineHeight: 19,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  rowName: {
    fontSize: 14, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text,
  },
  rowMacros: {
    fontSize: 12, fontFamily: fontFamily.regular, color: C.text2, marginTop: 2,
  },
  rowDelete: {
    paddingLeft: 12,
    paddingVertical: 4,
  },
})
