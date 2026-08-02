import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import { AppStackParamList } from '../../navigation/types';
import { useGroupStore } from '../../store/groupStore';
import InviteCodeCard from '../../components/groups/InviteCodeCard';

export default function GroupInviteScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, 'GroupInvite'>>();
  const { groupId } = route.params;

  const group = useGroupStore((s) => s.myGroups.find((g) => g.id === groupId));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite people</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.successHeader}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={26} color="#fff" />
          </View>
          <Text style={styles.successTitle}>{group?.name ?? 'Your group'} is live 🎉</Text>
          <Text style={styles.successSubtitle}>Invite people to start your shared activity.</Text>
        </View>

        {group && <InviteCodeCard inviteCode={group.invite_code} />}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.goBtn}
          onPress={() => navigation.replace('GroupHome', { groupId })}
          activeOpacity={0.85}
        >
          <Text style={styles.goBtnText}>Go to group</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#2FB67A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: C.text,
    marginTop: 12,
  },
  successSubtitle: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: C.text2,
    marginTop: 4,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  goBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  goBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: '#fff',
  },
});
