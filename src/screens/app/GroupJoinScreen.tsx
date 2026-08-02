import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';
import { AppStackParamList } from '../../navigation/types';
import { useGroupStore, GroupPreview } from '../../store/groupStore';
import GroupAvatar from '../../components/groups/GroupAvatar';

export default function GroupJoinScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const previewGroupByCode = useGroupStore((s) => s.previewGroupByCode);
  const joinGroup = useGroupStore((s) => s.joinGroup);

  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);

  // Debounced live preview — looks up the group as the user finishes typing
  // a plausible code, rather than only on submit, matching the design's
  // "preview card appears before you commit to joining" flow.
  useEffect(() => {
    const trimmed = code.trim();
    setPreview(null);
    setNotFound(false);
    if (trimmed.length < 4) return;

    const handle = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await previewGroupByCode(trimmed);
        if (result) setPreview(result);
        else setNotFound(true);
      } catch {
        setNotFound(true);
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [code, previewGroupByCode]);

  const handleJoin = async () => {
    if (!preview) return;
    setJoining(true);
    try {
      const group = await joinGroup(code.trim());
      navigation.replace('GroupHome', { groupId: group.id });
    } catch {
      setNotFound(true);
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Join a group</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="person-add-outline" size={30} color={C.accent} />
          </View>
          <Text style={styles.title}>Enter invite code</Text>
          <Text style={styles.subtitle}>Ask a member for the group's code, or open their invite link.</Text>

          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="STEADY-XXXX"
            placeholderTextColor={C.muted}
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {checking && (
            <View style={styles.statusRow}>
              <ActivityIndicator color={C.accent} size="small" />
            </View>
          )}

          {notFound && !checking && (
            <Text style={styles.errorText}>No group found for that invite code.</Text>
          )}

          {preview && !checking && (
            <View style={styles.previewCard}>
              <View style={styles.previewEmojiWrap}>
                <Text style={styles.previewEmoji}>🍱</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewName}>{preview.name}</Text>
                <Text style={styles.previewMeta}>{preview.member_count} members</Text>
              </View>
              <View style={styles.previewAvatars}>
                {preview.member_avatars.slice(0, 3).map((url, i) => (
                  <View key={i} style={[i > 0 && { marginLeft: -12 }]}>
                    <GroupAvatar name={null} avatarUrl={url} size={30} />
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.joinBtn, !preview && { opacity: 0.5 }]}
          onPress={handleJoin}
          activeOpacity={0.85}
          disabled={!preview || joining}
        >
          {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.joinBtnText}>Join group</Text>}
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
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 20,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: C.text,
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: C.text2,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  input: {
    height: 52,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.accentPressed,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    letterSpacing: 1.5,
    color: C.text,
    textAlign: 'center',
    marginTop: 20,
  },
  statusRow: {
    alignItems: 'center',
    marginTop: 16,
  },
  errorText: {
    fontSize: 12.5,
    fontFamily: fontFamily.regular,
    color: C.error,
    textAlign: 'center',
    marginTop: 12,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 13,
    marginTop: 18,
    shadowColor: '#3C285A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  previewEmojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmoji: {
    fontSize: 18,
  },
  previewName: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text,
  },
  previewMeta: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: C.text2,
    marginTop: 1,
  },
  previewAvatars: {
    flexDirection: 'row',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  joinBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: '#fff',
  },
});
