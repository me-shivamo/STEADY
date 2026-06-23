import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';

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
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, styles.bodyContent]}>{children}</View>
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
    paddingVertical: spacing.md,
  },
  dot: { height: 8, borderRadius: radius.full },
  dotActive: { width: 22, backgroundColor: colors.accent },
  dotCompleted: { width: 8, backgroundColor: colors.accent, opacity: 0.45 },
  dotEmpty: { width: 8, backgroundColor: colors.border },

  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: spacing.sm,
  },
  button: {
    height: 48,
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
    letterSpacing: 0.1,
  },
  buttonTextDisabled: { color: '#8E8E93' },
  secondary: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  secondaryText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
