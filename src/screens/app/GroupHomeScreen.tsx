import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import { AppStackParamList } from '../../navigation/types';
import { useGroupStore } from '../../store/groupStore';
import { useAuthStore } from '../../store/authStore';
import GroupActivityScoreCard from '../../components/groups/GroupActivityScoreCard';
import LeaderboardRow from '../../components/groups/LeaderboardRow';
import ActivityFeedItem from '../../components/groups/ActivityFeedItem';

type Tab = 'board' | 'activity';

export default function GroupHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'GroupHome'>>();
  const myUserId = useAuthStore((s) => s.session?.user.id);

  const myGroups = useGroupStore((s) => s.myGroups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const leaderboard = useGroupStore((s) => s.leaderboard);
  const activityScore = useGroupStore((s) => s.activityScore);
  const activityFeed = useGroupStore((s) => s.activityFeed);
  const loading = useGroupStore((s) => s.loading);
  const fetchMyGroups = useGroupStore((s) => s.fetchMyGroups);
  const fetchLeaderboard = useGroupStore((s) => s.fetchLeaderboard);
  const fetchActivityScore = useGroupStore((s) => s.fetchActivityScore);
  const fetchActivityFeed = useGroupStore((s) => s.fetchActivityFeed);
  const postCheer = useGroupStore((s) => s.postCheer);
  const removeCheer = useGroupStore((s) => s.removeCheer);
  const leaveGroup = useGroupStore((s) => s.leaveGroup);

  const groupId = route.params?.groupId ?? activeGroupId;
  const group = myGroups.find((g) => g.id === groupId);

  const [tab, setTab] = useState<Tab>('board');
  const [refreshing, setRefreshing] = useState(false);

  // fetchMyGroups() is deliberately NOT re-run here on every focus — it
  // rebuilds a brand-new myGroups array on every call, and re-running it
  // every time this screen refocuses (which useFocusEffect does often —
  // e.g. after any child screen pops back) was causing visible re-render
  // churn ("fluctuating" UI) for no benefit, since group name/member_count
  // rarely change within a session. It's still fetched once on mount below.
  const loadActivity = useCallback(async () => {
    if (!groupId) return;
    await Promise.all([
      fetchLeaderboard(groupId),
      fetchActivityScore(groupId),
      fetchActivityFeed(groupId),
    ]);
  }, [groupId, fetchLeaderboard, fetchActivityScore, fetchActivityFeed]);

  useEffect(() => {
    fetchMyGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActivity();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadActivity(), fetchMyGroups()]);
    setRefreshing(false);
  };

  const handleLeave = () => {
    if (!groupId) return;
    Alert.alert('Leave group?', `You'll stop seeing ${group?.name ?? 'this group'}'s activity.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveGroup(groupId);
          navigation.replace('GroupsIntro');
        },
      },
    ]);
  };

  if (!groupId || !group) {
    return (
      <SafeAreaView style={styles.loadingSafe} edges={['top', 'bottom']}>
        <ActivityIndicator color={C.accent} />
      </SafeAreaView>
    );
  }

  const ranked = [...leaderboard].sort((a, b) => b.points - a.points);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
          <Text style={styles.groupMeta}>{group.member_count} members</Text>
        </View>
        <TouchableOpacity onPress={handleLeave} style={styles.moreBtn} activeOpacity={0.6}>
          <Ionicons name="exit-outline" size={20} color={C.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} />}
      >
        <GroupActivityScoreCard score={activityScore} members={ranked} />

        {/* Weekly challenge — placeholder for v1. Real challenge authoring
            (who sets the target, duration, reset cadence) isn't designed
            yet, so this shows real logged-meal progress against a simple
            auto-generated target rather than a fake number. */}
        <View style={styles.challengeCard}>
          <View style={styles.challengeHeader}>
            <Ionicons name="flag-outline" size={20} color={C.carbs} />
            <View style={{ flex: 1 }}>
              <Text style={styles.challengeTitle}>This week's challenge</Text>
              <Text style={styles.challengeSub}>Coming soon — custom group goals</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'board' && styles.tabBtnActive]}
            onPress={() => setTab('board')}
            activeOpacity={0.8}
          >
            <Ionicons name="trophy" size={16} color={tab === 'board' ? C.accent : C.muted} />
            <Text style={[styles.tabLabel, tab === 'board' && { color: C.accent }]}>Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'activity' && styles.tabBtnActive]}
            onPress={() => setTab('activity')}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={16} color={tab === 'activity' ? C.accent : C.muted} />
            <Text style={[styles.tabLabel, tab === 'activity' && { color: C.accent }]}>Activity</Text>
          </TouchableOpacity>
        </View>

        {loading && ranked.length === 0 ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
        ) : tab === 'board' ? (
          <View style={{ gap: 10 }}>
            {ranked.map((row, i) => (
              <LeaderboardRow key={row.user_id} row={row} rank={i + 1} isYou={row.user_id === myUserId} />
            ))}
            <Text style={styles.footnote}>Points earned for logging meals. Everyone starts even.</Text>
          </View>
        ) : (
          <View style={{ gap: 11 }}>
            {activityFeed.length === 0 ? (
              <Text style={styles.footnote}>No activity yet — log a meal to get things started.</Text>
            ) : (
              activityFeed.map((item) => (
                <ActivityFeedItem
                  key={item.id}
                  item={item}
                  onToggleCheer={() => (item.cheered_by_me ? removeCheer(item.id) : postCheer(item.id))}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingSafe: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupName: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: C.text,
    letterSpacing: -0.2,
  },
  groupMeta: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: C.text2,
    marginTop: 1,
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3C285A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  challengeCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
    shadowColor: '#3C285A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  challengeTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text,
  },
  challengeSub: {
    fontSize: 11.5,
    fontFamily: fontFamily.regular,
    color: C.text2,
    marginTop: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 11,
    padding: 3,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text2,
  },
  footnote: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: C.muted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
