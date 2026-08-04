import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../../store/toastStore';
import { fontFamily } from '../../theme/typography';

const C = {
  success: '#1D3A2F',
  error: '#4A1D1F',
  info: '#1D1D1F',
  text: '#FFFFFF',
  successIcon: '#5BD8A4',
  errorIcon: '#FF8A8F',
  infoIcon: '#B9B9C2',
} as const;

const VISIBLE_MS = 2200;

/**
 * Renders the single active toast. Mounted ONCE, as the last child of the app
 * root, so it paints on top of every screen and every bottom sheet.
 *
 * WHY IT LIVES AT THE ROOT
 * ------------------------
 * A toast triggered by an action that also closes a sheet must outlive that
 * sheet. Mounting per-screen reintroduces exactly the bug this replaces.
 *
 * ONE CAVEAT WORTH KNOWING: on Android a React Native <Modal> is a separate
 * native window, and nothing in the normal view tree can paint over it — so
 * while a modal is genuinely open this toast is behind it. That is fine for
 * every current call site, because they all dismiss their sheet before
 * confirming. If a toast is ever needed *while* a sheet stays open, it has to
 * be rendered inside that sheet's own Modal.
 *
 * Animation uses core RN Animated with useNativeDriver, not Reanimated —
 * project convention, because native-module versions must stay compatible with
 * the Expo SDK 54 bundled set.
 */
export default function ToastHost() {
  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const token = useToastStore((s) => s.token);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();

  // Two values because opacity and translate are driven together but read more
  // clearly apart. Both are native-driver safe (neither touches layout).
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;

    // A new toast while one is showing restarts the cycle rather than queueing:
    // the newest confirmation is the relevant one.
    if (timer.current) clearTimeout(timer.current);
    opacity.setValue(0);
    translateY.setValue(20);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, friction: 9, tension: 70, useNativeDriver: true }),
    ]).start();

    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        // Only clear if the animation actually completed — if a new toast
        // interrupted it, that toast now owns the state and must not be wiped.
        if (finished) hide();
      });
    }, VISIBLE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `token` is in the deps so firing the same message twice replays it.
  }, [message, token, opacity, translateY, hide]);

  if (!message) return null;

  const bg = kind === 'error' ? C.error : kind === 'info' ? C.info : C.success;
  const iconColor =
    kind === 'error' ? C.errorIcon : kind === 'info' ? C.infoIcon : C.successIcon;
  const iconName =
    kind === 'error' ? 'alert-circle' : kind === 'info' ? 'information-circle' : 'checkmark-circle';

  return (
    <View
      // pointerEvents='none' so the toast never eats a tap meant for the UI
      // underneath it — it is information, not a control.
      pointerEvents="none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 16 }]}
    >
      <Animated.View
        style={[styles.toast, { backgroundColor: bg, opacity, transform: [{ translateY }] }]}
      >
        <Ionicons name={iconName} size={18} color={iconColor} />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    maxWidth: 420,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  text: {
    color: C.text,
    fontSize: 14,
    flexShrink: 1,
    fontFamily: fontFamily.medium,
  },
});
