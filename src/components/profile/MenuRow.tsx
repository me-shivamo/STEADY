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
 *   - 'destructive' → red label, no chevron (Sign Out)
 */
export type MenuRowVariant = 'default' | 'destructive';

interface MenuRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name']; // monochrome line icon
  label: string;
  variant?: MenuRowVariant;
  showDivider?: boolean;   // bottom hairline between rows
  onPress?: () => void;
}

export default function MenuRow({
  icon,
  label,
  variant = 'default',
  showDivider = true,
  onPress,
}: MenuRowProps) {
  const isDestructive = variant === 'destructive';

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={[
        styles.row,
        showDivider && styles.rowDivider,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={isDestructive ? C.error : C.muted}
        style={styles.icon}
      />

      <View style={styles.labelBlock}>
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            isDestructive && styles.labelDestructive,
          ]}
        >
          {label}
        </Text>
      </View>

      {/* Chevron, hidden on destructive */}
      {!isDestructive && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={C.muted}
        />
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
  labelDestructive: {
    fontWeight: '500',
    color: C.error,
  },
});
