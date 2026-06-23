import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';

interface Props {
  /** The message STEADY "says". */
  message: string;
  /** Optional muted hint line shown below the bubble (e.g. Diet screen). */
  hint?: string;
}

// ChatBubble — the STEADY avatar + speech bubble + "STEADY" sender label.
// One canonical look, used on every onboarding screen so the avatar size,
// bubble padding, shadow, and alignment never drift between screens.
//
// Note: avatar is aligned to flex-start so on multi-line bubbles it sits at the
// top-left "speaker" position consistently (rather than centring on short
// bubbles and top-aligning on tall ones, which was the old inconsistency).
export default function ChatBubble({ message, hint }: Props) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>S</Text>
        </View>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{message}</Text>
        </View>
      </View>
      <Text style={styles.senderLabel}>STEADY</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const AVATAR_SIZE = 32;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarText: {
    color: '#fff',
    fontSize: typography.md,
    fontWeight: '800',
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleText: {
    fontSize: typography.md,
    color: colors.textPrimary,
    lineHeight: 21,
    fontWeight: '500',
  },
  senderLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginLeft: AVATAR_SIZE + spacing.sm,
    marginTop: spacing.xs,
  },
  hint: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: 19,
  },
});
