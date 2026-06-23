import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { homeColors as C } from '../../theme/homeColors';

/**
 * One row in the profile drawer menu.
 *
 * This is a presentational component: it renders whatever the parent passes via
 * props and reports taps back through `onPress`. It holds no state of its own.
 *
 * `variant` switches the look:
 *   - 'default'     → normal row, chevron on the right
 *   - 'premium'     → accent-soft background, accent title + subtitle (Go Premium)
 *   - 'destructive' → red label, no chevron (Sign Out)
 */
export type MenuRowVariant = 'default' | 'premium' | 'destructive';

interface MenuRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name']; // monochrome line icon
  label: string;
  subtitle?: string;       // premium row only
  badge?: string;          // e.g. "Learned 12 foods"
  variant?: MenuRowVariant;
  showDivider?: boolean;   // bottom hairline between rows
  onPress?: () => void;
}

export default function MenuRow({
  icon,
  label,
  subtitle,
  badge,
  variant = 'default',
  showDivider = true,
  onPress,
}: MenuRowProps) {
  const isPremium = variant === 'premium';
  const isDestructive = variant === 'destructive';

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={[
        styles.row,
        isPremium && styles.rowPremium,
        showDivider && styles.rowDivider,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={isPremium ? C.accent : isDestructive ? C.error : C.muted}
        style={styles.icon}
      />

      {/* Label block — premium has a title + subtitle stacked */}
      <View style={styles.labelBlock}>
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            isPremium && styles.labelPremium,
            isDestructive && styles.labelDestructive,
          ]}
        >
          {label}
        </Text>
        {isPremium && subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      {/* Right side: badge, or chevron (hidden on destructive) */}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : (
        !isDestructive && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={isPremium ? C.accent : C.muted}
          />
        )
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    minHeight: 42,
    backgroundColor: C.card,
  },
  rowPremium: {
    backgroundColor: C.accentSoft,
    minHeight: 46,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.surface,
  },
  icon: {
    width: 24,
    textAlign: 'center',
  },
  labelBlock: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '400',
    color: C.text,
  },
  labelPremium: {
    fontWeight: '600',
    color: C.accent,
  },
  labelDestructive: {
    fontWeight: '500',
    color: C.error,
  },
  subtitle: {
    fontSize: 11.5,
    color: C.text2,
    marginTop: 0,
  },
  badge: {
    height: 21,
    paddingHorizontal: 9,
    borderRadius: 20,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.accent,
  },
});
