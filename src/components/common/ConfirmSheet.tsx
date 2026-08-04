import React from 'react'
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontFamily } from '../../theme/typography'

const C = {
  card:     '#FFFFFF',
  text:     '#1D1D1F',
  text2:    '#6E6E73',
  border:   '#E4E2EC',
  danger:   '#E5484D',
  dangerSoft: '#FDEBEC',
  neutral:  '#F2F2F7',
  backdrop: 'rgba(0,0,0,0.38)',
} as const

interface Props {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  /** Shown in red below the message if the confirmed action failed — the
   *  sheet stays open so the user can retry instead of losing their place. */
  errorMessage?: string | null
  onConfirm: () => void
  onCancel: () => void
}

// ConfirmSheet — a bottom-sheet confirm dialog matching STEADY's own design
// tokens, used in place of the OS-native Alert.alert for destructive actions
// (delete meal/water/weight/measurement). Alert.alert can't be restyled —
// it's a real system dialog, not a component — so anywhere the design calls
// for an in-brand confirmation, this replaces it instead.
export default function ConfirmSheet({
  visible, title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel',
  destructive = true, loading = false, errorMessage, onConfirm, onCancel,
}: Props) {
  // Same edge-to-edge problem as MealCard's options sheet: this Modal's window
  // runs under the Android navigation bar, so the confirm/cancel buttons — the
  // whole point of the sheet — end up beneath the system buttons. 32 stays the
  // floor so the spacing is unchanged on devices with no bottom inset.
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 32) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconWrap, destructive && styles.iconWrapDanger]}>
            <Ionicons
              name={destructive ? 'trash-outline' : 'alert-circle-outline'}
              size={22}
              color={destructive ? C.danger : C.text}
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, destructive ? styles.dangerButton : styles.confirmButton]}
              onPress={onConfirm}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
              }
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.neutral,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  iconWrapDanger: {
    backgroundColor: C.dangerSoft,
  },
  title: {
    fontSize: 17, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text,
    textAlign: 'center', marginBottom: 6,
  },
  message: {
    fontSize: 14, fontFamily: fontFamily.regular, color: C.text2,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  errorText: {
    fontSize: 13, fontFamily: fontFamily.medium, color: C.danger,
    textAlign: 'center', marginTop: -14, marginBottom: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  button: {
    flex: 1, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: C.neutral,
  },
  cancelButtonText: {
    fontSize: 15, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text,
  },
  dangerButton: {
    backgroundColor: C.danger,
  },
  confirmButton: {
    backgroundColor: C.text,
  },
  confirmButtonText: {
    fontSize: 15, fontWeight: '700', fontFamily: fontFamily.bold, color: '#fff',
  },
})
