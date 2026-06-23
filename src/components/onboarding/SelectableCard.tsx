import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';

interface CardProps {
  emoji: string;
  label: string;
  /** Optional second line (Activity screen). Omit for compact rows (Goal). */
  description?: string;
  selected: boolean;
  onPress: () => void;
  style?: ViewStyle;
  /** Hide the trailing selected dot (Goal screen relies on border/bg only). */
  hideIndicator?: boolean;
}

// SelectableCard — the canonical option row used on the Goal and Activity
// screens. Selected treatment everywhere: accent border + accentSoft bg +
// accent label. By default a filled accent dot marks the selection (Activity);
// pass `hideIndicator` to rely on border/bg only (Goal). The chevron shows when
// unselected.
export function SelectableCard({
  emoji,
  label,
  description,
  selected,
  onPress,
  style,
  hideIndicator = false,
}: CardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.textWrap}>
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
        {description ? (
          <Text style={[styles.description, selected && styles.descriptionSelected]}>
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        hideIndicator ? null : <View style={styles.checkDot} />
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

// Chip — pill-shaped selectable used for the Diet multi-select and the
// TargetWeight timeline. Same accent-border + accentSoft selected look as the
// card, so the whole flow reads as one design language.
export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // --- Card ---
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  emoji: {
    fontSize: typography.xl,
    width: 28,
    textAlign: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
  label: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  labelSelected: { color: colors.accent },
  description: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  descriptionSelected: { color: colors.accent, opacity: 0.8 },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  chevron: {
    fontSize: typography.xl,
    color: colors.textMuted,
    lineHeight: 24,
  },

  // --- Chip ---
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: { color: colors.accent },
});
