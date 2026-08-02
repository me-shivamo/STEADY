import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import GroupAvatar from './GroupAvatar';
import type { ActivityFeedItem as ActivityFeedItemData } from '../../store/groupStore';

// A filled heart reads as "liked" almost universally because it's red —
// tinting it the app's indigo accent (used for cheerBtnActive's background
// below) makes it look selected/highlighted rather than actually loved.
// This is the one deliberate departure from STEADY's accent color in the
// whole Groups feature, scoped to just this icon + count.
const CHEER_RED = '#E5484D';

const EVENT_COPY: Record<ActivityFeedItemData['event_type'], { text: string; emoji: string }> = {
  logged_meal: { text: 'logged a meal', emoji: '🍽️' },
  streak_milestone: { text: 'hit a streak milestone', emoji: '🔥' },
  goal_hit: { text: 'hit their goal', emoji: '🎯' },
  joined_group: { text: 'joined the group', emoji: '👋' },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface ActivityFeedItemProps {
  item: ActivityFeedItemData;
  onToggleCheer: () => void;
}

export default function ActivityFeedItem({ item, onToggleCheer }: ActivityFeedItemProps) {
  const copy = EVENT_COPY[item.event_type];
  const streakDays = item.event_meta?.streak_days;

  return (
    <View style={styles.row}>
      <GroupAvatar name={item.full_name} avatarUrl={item.avatar_url} size={34} />
      <View style={styles.info}>
        <Text style={styles.text}>
          <Text style={styles.name}>{item.full_name ?? 'Member'}</Text>{' '}
          {typeof streakDays === 'number' ? `hit a ${streakDays}-day streak` : copy.text} {copy.emoji}
        </Text>
        <Text style={styles.time}>{relativeTime(item.created_at)} ago</Text>
      </View>
      <TouchableOpacity
        style={[styles.cheerBtn, item.cheered_by_me && styles.cheerBtnActive]}
        onPress={onToggleCheer}
        activeOpacity={0.75}
      >
        <Ionicons
          name={item.cheered_by_me ? 'heart' : 'heart-outline'}
          size={16}
          color={item.cheered_by_me ? CHEER_RED : C.text2}
        />
        <Text style={[styles.cheerCount, item.cheered_by_me && { color: CHEER_RED }]}>{item.cheer_count}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: C.card,
    shadowColor: '#3C285A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    color: C.text,
    lineHeight: 19,
  },
  name: {
    fontWeight: '700',
    fontFamily: fontFamily.bold,
  },
  time: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: C.muted,
    marginTop: 3,
  },
  cheerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: C.surface,
    flexShrink: 0,
  },
  cheerBtnActive: {
    backgroundColor: C.accentSoft,
  },
  cheerCount: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text2,
  },
});
