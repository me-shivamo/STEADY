import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import { AppStackParamList } from '../../navigation/types';
import { useGroupStore, GroupCategory } from '../../store/groupStore';

const KINDS: { id: GroupCategory; emoji: string; label: string }[] = [
  { id: 'friends', emoji: '🤝', label: 'Friends' },
  { id: 'family', emoji: '🏡', label: 'Family' },
  { id: 'coach', emoji: '🥗', label: 'With a coach' },
  { id: 'team', emoji: '💪', label: 'Team / gym' },
];

export default function GroupCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const createGroup = useGroupStore((s) => s.createGroup);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupCategory>('friends');
  const [creating, setCreating] = useState(false);

  const canCreate = name.trim().length > 0 && !creating;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const group = await createGroup(name.trim(), kind);
      navigation.replace('GroupInvite', { groupId: group.id });
    } catch (e) {
      Alert.alert('Could not create group', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create a group</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>GROUP NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. The Meal Preppers"
            placeholderTextColor={C.muted}
            style={styles.input}
            maxLength={60}
          />

          <Text style={[styles.label, { marginTop: 22, marginBottom: 10 }]}>WHO'S IT FOR?</Text>
          <View style={styles.kindGrid}>
            {KINDS.map((k) => {
              const on = kind === k.id;
              return (
                <TouchableOpacity
                  key={k.id}
                  style={[styles.kindCard, on && styles.kindCardActive]}
                  onPress={() => setKind(k.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.kindEmoji}>{k.emoji}</Text>
                  <Text style={[styles.kindLabel, on && { color: C.accent }]}>{k.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.hintCard}>
            <Ionicons name="flash" size={15} color={C.accent} style={{ marginTop: 1 }} />
            <Text style={styles.hintText}>
              You'll get a <Text style={styles.hintBold}>shareable invite code</Text> next.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, !canCreate && { opacity: 0.5 }]}
          onPress={handleCreate}
          activeOpacity={0.85}
          disabled={!canCreate}
        >
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create group</Text>}
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
    paddingTop: 12,
    paddingBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: 0.4,
    color: C.text2,
  },
  input: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: C.text,
    marginTop: 8,
  },
  kindGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kindCard: {
    width: '47%',
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  kindCardActive: {
    backgroundColor: C.accentSoft,
    borderColor: C.accentPressed,
  },
  kindEmoji: {
    fontSize: 18,
  },
  kindLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text,
  },
  hintCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 20,
    padding: 13,
    borderRadius: 12,
    backgroundColor: C.accentSoft,
  },
  hintText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: fontFamily.regular,
    color: C.text,
    lineHeight: 17,
  },
  hintBold: {
    fontWeight: '700',
    fontFamily: fontFamily.bold,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  createBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: '#fff',
  },
});
