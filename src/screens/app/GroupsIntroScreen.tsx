import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import { AppStackParamList } from '../../navigation/types';
import { useGroupStore } from '../../store/groupStore';
import GroupAvatar from '../../components/groups/GroupAvatar';

const FEATURES = [
  {
    icon: 'restaurant-outline' as const,
    title: 'Shared meal tracking',
    body: 'See how everyone in the group is doing at a glance.',
  },
  {
    icon: 'person-add-outline' as const,
    title: 'Invite friends & family',
    body: "Bring in people who'll keep you accountable.",
  },
  {
    icon: 'trending-up-outline' as const,
    title: 'Group insights',
    body: 'Compare streaks and cheer each other on.',
  },
];

// Neutral placeholder avatars for the hero illustration, shown before the
// user has any real groupmates to display.
const HERO_PREVIEW = [
  { name: 'A', avatarUrl: null },
  { name: 'You', avatarUrl: null },
  { name: 'B', avatarUrl: null },
];

export default function GroupsIntroScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const myGroups = useGroupStore((s) => s.myGroups);
  const fetchMyGroups = useGroupStore((s) => s.fetchMyGroups);
  const [checked, setChecked] = useState(false);

  // Groups is a single entry point (drawer row + Home header icon) that
  // always routes here first — this screen decides whether the user
  // actually needs the "what is Groups" pitch, or should be dropped
  // straight into their existing group's dashboard instead.
  useEffect(() => {
    (async () => {
      await fetchMyGroups();
      setChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // This screen stays mounted (just unfocused) underneath GroupCreate/
  // GroupInvite while the user is on the create-a-group flow — a plain
  // useEffect here would keep firing in the background the moment
  // createGroup() updates myGroups, hijacking navigation.replace('GroupHome')
  // away from whatever screen is actually on top (e.g. yanking the user
  // straight past the Invite screen they hadn't seen yet). useFocusEffect
  // only runs this check while GroupsIntro is the actual visible screen.
  useFocusEffect(
    useCallback(() => {
      if (checked && myGroups.length > 0) {
        navigation.replace('GroupHome', { groupId: myGroups[0].id });
      }
    }, [checked, myGroups, navigation])
  );

  if (!checked || myGroups.length > 0) {
    return (
      <SafeAreaView style={styles.loadingSafe} edges={['top', 'bottom']}>
        <ActivityIndicator color={C.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Groups</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.heroRow}>
          {HERO_PREVIEW.map((m, i) => (
            <View key={i} style={[styles.heroAvatarWrap, i > 0 && { marginLeft: -14 }, i === 1 && styles.heroAvatarCenter]}>
              <GroupAvatar name={m.name} avatarUrl={m.avatarUrl} size={i === 1 ? 56 : 44} />
            </View>
          ))}
        </View>

        <Text style={styles.title}>Better together</Text>
        <Text style={styles.subtitle}>
          Track meals as a group and keep each other accountable.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={18} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('GroupCreate')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Create a group</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => navigation.navigate('GroupJoin')}
          activeOpacity={0.85}
        >
          <Ionicons name="person-add-outline" size={18} color={C.accent} />
          <Text style={styles.outlineBtnText}>Join a group</Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: C.text,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroAvatarWrap: {
    zIndex: 1,
  },
  heroAvatarCenter: {
    zIndex: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    color: C.text2,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },
  features: {
    gap: 16,
    marginTop: 28,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text,
  },
  featureBody: {
    fontSize: 12.5,
    fontFamily: fontFamily.regular,
    color: C.text2,
    lineHeight: 17,
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: '#fff',
  },
  outlineBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  outlineBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.accent,
  },
});
