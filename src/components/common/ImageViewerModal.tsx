import React from 'react';
import { Modal, View, Image, Pressable, StyleSheet, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  /** Non-null opens the viewer. Local file:// URIs and remote URLs both work. */
  uri: string | null;
  onClose: () => void;
}

/**
 * Full-screen photo preview.
 *
 * Meal photos are rendered as a 48px thumbnail so the card stays compact (that
 * size was a deliberate earlier decision), but 48px is far too small to check
 * whether the AI actually identified the right food. Tapping to enlarge closes
 * that gap without giving the thumbnail back its old space.
 *
 * Deliberately a plain tap-to-open / tap-to-close viewer rather than a
 * pinch-to-zoom one: gesture-handler and reanimated are both installed and
 * could do it, but pinch-zoom needs its own gesture root and pan boundaries,
 * and the actual need here is "let me see the photo properly", which
 * resizeMode="contain" on a black backdrop already satisfies.
 */
export default function ImageViewerModal({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={uri != null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Lets the black backdrop run under the status bar instead of leaving a
      // pale band above a full-bleed photo.
      statusBarTranslucent
    >
      {/* Light status-bar icons, because the backdrop behind them is black. */}
      <StatusBar barStyle="light-content" />
      {/* The whole backdrop is the dismiss target — the usual expectation for
          a lightbox, and it avoids relying on the small close button alone. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}

        <Pressable
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
