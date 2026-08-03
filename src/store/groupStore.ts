import { create } from 'zustand';
import { Alert } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';
import type { Tables } from '../types/database';
import { track, errorReason } from '../utils/analytics';

export type GroupCategory = 'friends' | 'family' | 'coach' | 'team';

export interface GroupSummary {
  id: string;
  name: string;
  category: GroupCategory;
  invite_code: string;
  role: 'admin' | 'member';
  member_count: number;
}

export interface GroupPreview {
  group_id: string;
  name: string;
  category: string;
  member_count: number;
  member_avatars: string[];
}

export interface LeaderboardRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  current_streak: number;
  logged_today: boolean;
}

export interface ActivityScore {
  memberCount: number;
  loggedTodayCount: number;
  pct: number;
}

export interface ActivityFeedItem {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  event_type: 'logged_meal' | 'streak_milestone' | 'goal_hit' | 'joined_group';
  event_meta: Record<string, unknown>;
  created_at: string;
  cheer_count: number;
  cheered_by_me: boolean;
}

interface GroupState {
  myGroups: GroupSummary[];
  activeGroupId: string | null;
  leaderboard: LeaderboardRow[];
  activityScore: ActivityScore | null;
  activityFeed: ActivityFeedItem[];
  loading: boolean;
  error: string | null;

  fetchMyGroups: () => Promise<void>;
  setActiveGroup: (groupId: string) => void;
  createGroup: (name: string, category: GroupCategory) => Promise<GroupSummary>;
  previewGroupByCode: (code: string) => Promise<GroupPreview | null>;
  joinGroup: (code: string) => Promise<GroupSummary>;
  leaveGroup: (groupId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  fetchLeaderboard: (groupId: string) => Promise<void>;
  fetchActivityScore: (groupId: string) => Promise<void>;
  fetchActivityFeed: (groupId: string, before?: string) => Promise<void>;
  postCheer: (eventId: string) => Promise<void>;
  removeCheer: (eventId: string) => Promise<void>;
  // Stub — Reminders push infrastructure (Expo push token -> Supabase ->
  // pg_cron -> Edge Function) doesn't exist yet. Wire this up once that
  // lands: it'll call a future `send-group-nudge` Edge Function instead of
  // an RPC, since sending a push notification needs the Expo push API, not
  // just a database write.
  nudgeMember: (groupId: string, userId: string) => Promise<void>;
  reset: () => void;
}

const INITIAL_STATE = {
  myGroups: [] as GroupSummary[],
  activeGroupId: null as string | null,
  leaderboard: [] as LeaderboardRow[],
  activityScore: null as ActivityScore | null,
  activityFeed: [] as ActivityFeedItem[],
  loading: false,
  error: null as string | null,
};

export const useGroupStore = create<GroupState>((set, get) => ({
  ...INITIAL_STATE,

  fetchMyGroups: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from('group_members')
      .select('role, groups(id, name, category, invite_code)')
      .eq('user_id', userId);

    if (error || !data) {
      set({ loading: false });
      return;
    }

    const groups: GroupSummary[] = [];
    for (const row of data) {
      const g = row.groups as Tables<'groups'> | null;
      if (!g) continue;
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id);
      groups.push({
        id: g.id,
        name: g.name,
        category: g.category as GroupCategory,
        invite_code: g.invite_code,
        role: row.role as 'admin' | 'member',
        member_count: count ?? 0,
      });
    }

    set((s) => ({
      myGroups: groups,
      activeGroupId: s.activeGroupId ?? groups[0]?.id ?? null,
      loading: false,
    }));
  },

  setActiveGroup: (groupId) => {
    set({ activeGroupId: groupId });
    track('group_switched', { group_count: get().myGroups.length });
  },

  createGroup: async (name, category) => {
    const { data, error } = await supabase.rpc('create_group', { p_name: name, p_category: category });
    if (error || !data) {
      track('group_create_failed', { reason: errorReason(error) });
      throw new Error(error?.message ?? 'Could not create group');
    }
    const group: GroupSummary = {
      id: data.id,
      name: data.name,
      category: data.category as GroupCategory,
      invite_code: data.invite_code,
      role: 'admin',
      member_count: 1,
    };
    set((s) => ({ myGroups: [group, ...s.myGroups], activeGroupId: group.id }));
    // Category only — the group name is user-authored free text.
    track('group_created', { category });
    return group;
  },

  previewGroupByCode: async (code) => {
    const { data, error } = await supabase.rpc('get_group_preview_by_code', { p_code: code });
    if (error) {
      track('group_invite_previewed', { found: false });
      throw new Error(error.message);
    }
    const row = data?.[0];
    // Tracks whether typed invite codes actually resolve — a high `found:
    // false` rate would point at codes being hard to transcribe, which is a
    // fixable design problem rather than a mysterious drop-off.
    track('group_invite_previewed', { found: !!row });
    if (!row) return null;
    return {
      group_id: row.group_id,
      name: row.name,
      category: row.category,
      member_count: row.member_count,
      member_avatars: row.member_avatars ?? [],
    };
  },

  joinGroup: async (code) => {
    const { data, error } = await supabase.rpc('join_group_by_code', { p_code: code });
    if (error || !data) {
      track('group_join_failed', { reason: errorReason(error) });
      throw new Error(error?.message ?? 'Could not join group');
    }
    const group: GroupSummary = {
      id: data.id,
      name: data.name,
      category: data.category as GroupCategory,
      invite_code: data.invite_code,
      role: 'member',
      member_count: 0, // refreshed by fetchMyGroups on next load
    };
    set((s) => ({
      myGroups: s.myGroups.some((g) => g.id === group.id) ? s.myGroups : [group, ...s.myGroups],
      activeGroupId: group.id,
    }));
    track('group_joined', { member_count: group.member_count });
    return group;
  },

  leaveGroup: async (groupId) => {
    const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
    if (error) {
      Alert.alert('Could not leave group', error.message);
      return;
    }
    track('group_left', {});
    set((s) => {
      const myGroups = s.myGroups.filter((g) => g.id !== groupId);
      return {
        myGroups,
        activeGroupId: s.activeGroupId === groupId ? (myGroups[0]?.id ?? null) : s.activeGroupId,
      };
    });
  },

  renameGroup: async (groupId, name) => {
    const { error } = await supabase.from('groups').update({ name }).eq('id', groupId);
    if (error) {
      Alert.alert('Could not rename group', 'Check your connection and try again.');
      return;
    }
    set((s) => ({
      myGroups: s.myGroups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
    track('group_renamed', {});
  },

  removeMember: async (groupId, userId) => {
    const { error } = await supabase.rpc('remove_member', { p_group_id: groupId, p_user_id: userId });
    if (error) {
      Alert.alert('Could not remove member', error.message);
      return;
    }
    set((s) => ({
      leaderboard: s.leaderboard.filter((r) => r.user_id !== userId),
    }));
    track('group_member_removed', {});
  },

  deleteGroup: async (groupId) => {
    const { error } = await supabase.rpc('delete_group', { p_group_id: groupId });
    if (error) {
      Alert.alert('Could not delete group', error.message);
      return;
    }
    track('group_deleted', {});
    set((s) => {
      const myGroups = s.myGroups.filter((g) => g.id !== groupId);
      return {
        myGroups,
        activeGroupId: s.activeGroupId === groupId ? (myGroups[0]?.id ?? null) : s.activeGroupId,
      };
    });
  },

  fetchLeaderboard: async (groupId) => {
    set({ loading: true });
    const { data, error } = await supabase.rpc('get_group_leaderboard', { p_group_id: groupId });
    if (!error && data) {
      set({ leaderboard: data as LeaderboardRow[] });
    }
    set({ loading: false });
  },

  fetchActivityScore: async (groupId) => {
    const { data, error } = await supabase.rpc('get_group_activity_score', { p_group_id: groupId });
    if (!error && data?.[0]) {
      const row = data[0];
      set({
        activityScore: {
          memberCount: row.member_count,
          loggedTodayCount: row.logged_today_count,
          pct: Number(row.pct),
        },
      });
    }
  },

  fetchActivityFeed: async (groupId, before) => {
    const { data, error } = await supabase.rpc('get_group_activity_feed', {
      p_group_id: groupId,
      p_limit: 30,
      p_before: before,
    });
    if (error || !data) return;
    const items = data as ActivityFeedItem[];
    set((s) => ({
      activityFeed: before ? [...s.activityFeed, ...items] : items,
    }));
    // Only the "load more" case is interesting — the initial fetch is just the
    // screen opening, which screen tracking already covers.
    if (before) track('group_activity_feed_paginated', {});
  },

  postCheer: async (eventId) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    // Optimistic update — flip the UI immediately, roll back if the write fails.
    set((s) => ({
      activityFeed: s.activityFeed.map((item) =>
        item.id === eventId
          ? { ...item, cheered_by_me: true, cheer_count: item.cheer_count + 1 }
          : item
      ),
    }));

    const { error } = await supabase.from('group_activity_cheers').insert({ event_id: eventId, user_id: userId });
    if (error) {
      set((s) => ({
        activityFeed: s.activityFeed.map((item) =>
          item.id === eventId
            ? { ...item, cheered_by_me: false, cheer_count: Math.max(0, item.cheer_count - 1) }
            : item
        ),
      }));
      return;
    }
    // Tracked after the write confirms, not alongside the optimistic UI flip —
    // otherwise a rolled-back cheer would still be counted as engagement.
    track('group_cheer_posted', {});
  },

  removeCheer: async (eventId) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set((s) => ({
      activityFeed: s.activityFeed.map((item) =>
        item.id === eventId
          ? { ...item, cheered_by_me: false, cheer_count: Math.max(0, item.cheer_count - 1) }
          : item
      ),
    }));

    const { error } = await supabase
      .from('group_activity_cheers')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);
    if (error) {
      set((s) => ({
        activityFeed: s.activityFeed.map((item) =>
          item.id === eventId
            ? { ...item, cheered_by_me: true, cheer_count: item.cheer_count + 1 }
            : item
        ),
      }));
      return;
    }
    track('group_cheer_removed', {});
  },

  nudgeMember: async () => {
    // Tracked even though the call always throws: the event count IS the
    // demand signal for whether the push pipeline is worth finishing.
    track('group_nudge_attempted', {});
    // TODO: wire to Reminders push infra once built (Expo push token table +
    // pg_cron + Edge Function already exist for personal reminders — a group
    // nudge is the same pipeline, targeted at someone else's token instead
    // of your own). Not implemented yet, so this surfaces a clear message
    // rather than silently doing nothing.
    throw new Error('Nudging isn’t available yet — coming soon!');
  },

  reset: () => set({ ...INITIAL_STATE }),
}));
