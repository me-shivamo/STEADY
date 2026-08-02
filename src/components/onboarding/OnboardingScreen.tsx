import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { typography, fontFamily } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { useScreenChrome } from '../../hooks/useScreenChrome';

interface Props {
  /** 1-based step number for the progress dots. */
  step: number;
  totalSteps?: number;
  children: React.ReactNode;
  /** Primary CTA. */
  buttonLabel: string;
  onContinue: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Optional secondary link under the button ("Skip", "No restrictions"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** When false, the body is not wrapped in a ScrollView (Stats screen, whose
   *  pickers must not nest inside a vertical scroll). Defaults to true. */
  scroll?: boolean;
}

// OnboardingScreen — the shared frame for every onboarding step: SafeAreaView +
// progress dots at the top, the screen's own content in the middle (as
// `children`), and a footer CTA (+ optional secondary link). Extracting this
// guarantees the dots, button, and spacing are pixel-identical across all six
// screens instead of being copy-pasted (and drifting).
export default function OnboardingScreen({
  step,
  totalSteps = 6,
  children,
  buttonLabel,
  onContinue,
  disabled = false,
  loading = false,
  secondaryLabel,
  onSecondary,
  scroll = true,
}: Props) {
  useScreenChrome(colors.bgPrimary, 'dark');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < step - 1
                ? styles.dotCompleted
                : i === step - 1
                ? styles.dotActive
                : styles.dotEmpty,
            ]}
          />
        ))}
      </View>

      {scroll ? (
        // Wrapped in KeyboardAvoidingView so a text input low in the content
        // doesn't end up hidden under the keyboard, for any future scrolling
        // onboarding screen that adds one (Target Weight — the screen that
        // originally motivated this — has since moved to scroll={false}
        // instead, see OnboardingTargetWeightScreen.tsx). Note: this app runs
        // on Expo Go, which ships its own fixed, pre-built AndroidManifest.xml
        // — the project's own android/app/src/main/AndroidManifest.xml (with
        // windowSoftInputMode="adjustResize") only takes effect in a real
        // native build (expo run:android / EAS / a dev client), never in Expo
        // Go itself. So on this app's actual runtime, Android gets NO
        // OS-level resize at all, and 'height' here is the only thing
        // pushing content up when the keyboard opens.
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        // Non-scrolling screens (Stats) can't use a ScrollView — the drum
        // pickers are scroll views themselves and would fight a vertical
        // parent. Centring the column here needs care: plain
        // `justifyContent: 'center'` overflows *symmetrically*, so a column
        // taller than the screen loses its top — which is how the ChatBubble
        // got pushed off-screen before. Auto margins centre without that risk:
        // they only ever absorb *positive* free space, so they split the slack
        // evenly when it exists and collapse to 0 the moment it doesn't,
        // leaving the column top-aligned instead of clipped. The realistic way
        // this screen runs out of room is a large accessibility text size.
        <View style={[styles.body, styles.bodyContent, styles.bodyContentTop]}>
          <View style={styles.centredBlock}>{children}</View>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, (disabled || loading) && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={disabled || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
              {buttonLabel}
            </Text>
          )}
        </TouchableOpacity>
        {secondaryLabel && onSecondary ? (
          <TouchableOpacity onPress={onSecondary} activeOpacity={0.7} style={styles.secondary}>
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dot: { height: 8, borderRadius: radius.full },
  dotActive: { width: 22, backgroundColor: colors.accent },
  dotCompleted: { width: 8, backgroundColor: colors.accent, opacity: 0.45 },
  dotEmpty: { width: 8, backgroundColor: colors.border },

  body: { flex: 1 },
  bodyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  bodyContentTop: {
    // flex-start, not center — `centredBlock`'s auto margins do the centring,
    // and they need this to stay the fallback when free space hits zero.
    justifyContent: 'flex-start',
    // Guarantees a gap under the progress dots in that fallback case, so an
    // overflowing column still doesn't read as glued to the top of the screen.
    paddingTop: spacing.md,
  },
  centredBlock: {
    marginTop: 'auto',
    marginBottom: 'auto',
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: spacing.xs,
  },
  button: {
    height: 46,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#D1D1D6',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: typography.lg,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: 0.1,
  },
  buttonTextDisabled: { color: '#8E8E93' },
  secondary: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontWeight: '500',
    fontFamily: fontFamily.medium,
  },
});
