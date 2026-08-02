import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import GroupAvatar from './GroupAvatar';
import type { LeaderboardRow as LeaderboardRowData } from '../../store/groupStore';

// Medal colors for the top 3 ranks — local to this component since no other
// screen in the app needs a "gold/silver/bronze" palette.
const MEDAL_COLORS = ['#F5A623', '#B8C0CC', '#CD8B5B'];

interface LeaderboardRowProps {
  row: LeaderboardRowData;
  rank: number;
  isYou: boolean;
}

export default function LeaderboardRow({ row, rank, isYou }: LeaderboardRowProps) {
  return (
    <View style={[styles.row, isYou && styles.rowYou]}>
      <Text style={[styles.rank, rank <= 3 && { color: MEDAL_COLORS[rank - 1] }]}>{rank}</Text>
      <GroupAvatar name={row.full_name} avatarUrl={row.avatar_url} size={36} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{row.full_name ?? 'Member'}</Text>
          {isYou && (
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>YOU</Text>
            </View>
          )}
        </View>
        <View style={styles.streakRow}>
          <Ionicons name="flame" size={13} color={C.carbs} />
          <Text style={styles.streakText}>{row.current_streak}-day streak</Text>
        </View>
      </View>
      <View style={styles.pointsWrap}>
        <Text style={[styles.points, isYou && { color: C.accent }]}>{row.points}</Text>
        <Text style={styles.pointsLabel}>POINTS</Text>
      </View>
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
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#3C285A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  rowYou: {
    backgroundColor: C.accentSoft,
    borderColor: C.accentPressed,
    shadowOpacity: 0,
    elevation: 0,
  },
  rank: {
    width: 26,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: C.muted,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15.5,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text,
    flexShrink: 1,
  },
  youBadge: {
    backgroundColor: C.card,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.accent,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  streakText: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: fontFamily.medium,
    color: C.text2,
  },
  pointsWrap: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  points: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: C.text,
  },
  pointsLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: C.muted,
    letterSpacing: 0.4,
  },
});
