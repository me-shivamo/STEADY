import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { typography, fontFamily } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import TypewriterText from '../common/TypewriterText';

interface Props {
  /** The message STEADY "says". */
  message: string;
  /** Optional muted hint line shown below the bubble (e.g. Diet screen). */
  hint?: string;
  /** Reveal `message` word-by-word instead of all at once. Opt-in per screen. */
  animated?: boolean;
}

// ChatBubble — the STEADY speech bubble + "STEADY" sender label. One
// canonical look, used on every onboarding screen so the bubble padding,
// shadow, and alignment never drift between screens.
export default function ChatBubble({ message, hint, animated }: Props) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.bubble}>
          {animated ? (
            <TypewriterText text={message} style={styles.bubbleText} />
          ) : (
            <Text style={styles.bubbleText}>{message}</Text>
          )}
        </View>
      </View>
      <Text style={styles.senderLabel}>STEADY</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: spacing.xs,
  },
  bubble: {
    // No `flex: 1` here. `row` is a default (column) flex container despite the
    // name, so flex:1 meant "grow/shrink *vertically*, from a base height of 0"
    // — not "fill the width". On the Stats screen, whose column is a fixed
    // height and overflows, this was the only node in the tree with a non-zero
    // flexShrink, so it absorbed the whole overflow and collapsed to its
    // padding, hiding the message. Width already fills via the default
    // alignItems: 'stretch'; height should just be content + padding.
    backgroundColor: colors.bgSurface,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
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
    fontFamily: fontFamily.medium,
  },
  senderLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontFamily: fontFamily.regular,
  },
  hint: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
  },
});
