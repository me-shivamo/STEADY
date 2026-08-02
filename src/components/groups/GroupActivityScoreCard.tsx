import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import GroupAvatar from './GroupAvatar';
import type { ActivityScore, LeaderboardRow } from '../../store/groupStore';

interface GroupActivityScoreCardProps {
  score: ActivityScore | null;
  members: LeaderboardRow[];
}

export default function GroupActivityScoreCard({ score, members }: GroupActivityScoreCardProps) {
  const loggedCount = score?.loggedTodayCount ?? 0;
  const total = score?.memberCount ?? members.length;
  const allIn = total > 0 && loggedCount === total;
  const pending = members.filter((m) => !m.logged_today);

  // Percentage width/height on <Svg> doesn't reliably resolve to the parent
  // View's actual pixel size on every platform/RN-SVG version — it can fall
  // back to a small intrinsic default, which is what produced the "gradient
  // box cutting through the card" bug. Measuring the card and passing exact
  // pixel dimensions to <Svg> avoids that ambiguity entirely.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onCardLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.card} onLayout={onCardLayout}>
      {size.width > 0 && size.height > 0 && (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
          <Defs>
            <SvgLinearGradient id="groupCardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#6D5EF5" />
              <Stop offset="55%" stopColor="#6366F1" />
              <Stop offset="100%" stopColor="#818CF8" />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} rx={16} fill="url(#groupCardGrad)" />
        </Svg>
      )}
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="flame" size={20} color="#FFD27A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headline}>
            {members.reduce((max, m) => Math.max(max, m.current_streak), 0)}
            <Text style={styles.headlineSub}> best streak</Text>
          </Text>
          <Text style={styles.subtext}>Everyone's own streak, side by side</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.avatarStack}>
          {members.slice(0, 5).map((m, i) => (
            <View key={m.user_id} style={[styles.avatarStackItem, i > 0 && { marginLeft: -8 }]}>
              <GroupAvatar name={m.full_name} avatarUrl={m.avatar_url} size={28} />
              <View style={[styles.statusDot, m.logged_today ? styles.statusDotOk : styles.statusDotPending]} />
            </View>
          ))}
        </View>
        <View style={styles.statusTextWrap}>
          <Text style={styles.statusText}>
            {allIn ? 'Everyone logged today! 🎉' : `${loggedCount}/${total} logged today`}
          </Text>
          {!allIn && pending.length > 0 && (
            <Text style={styles.statusSubtext} numberOfLines={1}>
              {pending[0].full_name} hasn't logged yet
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headline: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: '#fff',
    lineHeight: 22,
  },
  headlineSub: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: 'rgba(255,255,255,0.9)',
  },
  subtext: {
    fontSize: 11.5,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  avatarStack: {
    flexDirection: 'row',
  },
  avatarStackItem: {
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#6366F1',
  },
  statusDotOk: {
    backgroundColor: '#2FB67A',
  },
  statusDotPending: {
    backgroundColor: '#F5A623',
  },
  statusTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: '#fff',
    lineHeight: 15,
  },
  statusSubtext: {
    fontSize: 10.5,
    fontFamily: fontFamily.regular,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
});
