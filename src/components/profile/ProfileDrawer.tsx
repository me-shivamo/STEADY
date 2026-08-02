import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  ScrollView,
  Dimensions,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { useAuthStore } from '../../store/authStore';
import { useAdminPingStore } from '../../store/adminPingStore';
import { AppStackParamList } from '../../navigation/types';
import ProfileHeaderCard from './ProfileHeaderCard';
import StatStrip from './StatStrip';
import MenuRow, { MenuRowVariant } from './MenuRow';

const PANEL_WIDTH = Math.min(Dimensions.get('window').width * 0.88, 360);
const ANIM_MS = 280;

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
}

type MenuItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: string;
  variant?: MenuRowVariant;
  action: 'comingSoon' | 'signOut' | 'navigate' | 'premium' | 'pingAdmin' | 'helpSupport';
  // Only param-less routes belong in the menu — navigate(name) with no params
  // is only type-safe for routes whose params are undefined.
  screen?: 'Weight' | 'Water' | 'BodyMeasurements' | 'Progress' | 'Settings' | 'Reminders' | 'GroupsIntro';
};

const MENU: MenuItem[] = [
  { icon: 'bar-chart-outline', label: 'Progress Charts', action: 'navigate', screen: 'Progress' },
  { icon: 'scale-outline',     label: 'Weight',          action: 'navigate', screen: 'Weight' },
  { icon: 'water-outline',     label: 'Water',           action: 'navigate', screen: 'Water' },
  { icon: 'body-outline',      label: 'Body Measurements', action: 'navigate', screen: 'BodyMeasurements' },
  { icon: 'restaurant-outline', label: 'My Foods', action: 'pingAdmin' },
  { icon: 'notifications-outline', label: 'Reminders',   action: 'navigate', screen: 'Reminders' },
  { icon: 'people-outline',    label: 'Groups',          action: 'navigate', screen: 'GroupsIntro' },
  { icon: 'gift-outline',      label: 'Refer a Friend',  action: 'comingSoon' },
  { icon: 'settings-outline',  label: 'Settings',        action: 'navigate', screen: 'Settings' },
  { icon: 'help-circle-outline', label: 'Help & Support', action: 'helpSupport' },
  { icon: 'star-outline',      label: 'Go Premium', variant: 'premium', action: 'premium' },
  { icon: 'log-out-outline',   label: 'Sign Out',   variant: 'destructive', action: 'signOut' },
];

export default function ProfileDrawer({ open, onClose }: ProfileDrawerProps) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const signOut = useAuthStore((s) => s.signOut);
  const pingAdmin = useAdminPingStore((s) => s.ping);

  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(open);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [premiumSheetOpen, setPremiumSheetOpen] = useState(false);
  const [pingSheetOpen, setPingSheetOpen] = useState(false);
  const [pingCount, setPingCount] = useState<number | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingErrorText, setPingErrorText] = useState<string | null>(null);
  const [helpSheetOpen, setHelpSheetOpen] = useState(false);
  const signingOut = useRef(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: ANIM_MS,
        useNativeDriver: true,
      }).start();
    } else if (visible) {
      Animated.timing(progress, {
        toValue: 0,
        duration: ANIM_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!visible) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-PANEL_WIDTH, 0],
  });

  const handleSignOut = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setErrorText(null);
    try {
      await signOut();
      // Only close on success — closing first would hide any failure message,
      // since the drawer (and this inline text) would already be gone.
      onClose();
    } catch {
      setErrorText('Could not sign out. Please try again.');
    } finally {
      signingOut.current = false;
    }
  };

  const handlePress = (item: MenuItem) => {
    if (item.action === 'signOut') {
      handleSignOut();
    } else if (item.action === 'navigate' && item.screen) {
      // Close drawer first so it doesn't show behind the new screen
      onClose();
      navigation.navigate(item.screen);
    } else if (item.action === 'premium') {
      setPremiumSheetOpen(true);
    } else if (item.action === 'pingAdmin') {
      handlePingAdmin();
    } else if (item.action === 'helpSupport') {
      setHelpSheetOpen(true);
    }
    // 'comingSoon' rows are rendered disabled — they never reach onPress.
  };

  const handlePingAdmin = async () => {
    setPingSheetOpen(true);
    setPingLoading(true);
    setPingErrorText(null);
    const newCount = await pingAdmin();
    if (newCount == null) {
      setPingErrorText("Couldn't reach the counter. Check your connection and try again.");
    } else {
      setPingCount(newCount);
    }
    setPingLoading(false);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dimmed backdrop — tap to close */}
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sliding left panel */}
      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        <SafeAreaView style={styles.panelInner} edges={['top', 'bottom']}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <ProfileHeaderCard />
            {errorText ? <Text style={styles.inlineError}>{errorText}</Text> : null}
            <StatStrip />

            <View style={styles.menuCard}>
              {MENU.map((item, i) => (
                <MenuRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  badge={item.badge}
                  variant={item.variant}
                  showDivider={i < MENU.length - 1}
                  disabled={item.action === 'comingSoon'}
                  onPress={() => handlePress(item)}
                />
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>

      {/* ── Go Premium — free-access message, single-button dismiss ────────── */}
      <Modal visible={premiumSheetOpen} transparent animationType="fade" onRequestClose={() => setPremiumSheetOpen(false)}>
        <Pressable style={styles.premiumBackdrop} onPress={() => setPremiumSheetOpen(false)}>
          <Pressable style={styles.premiumSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.premiumIconWrap}>
              <Ionicons name="heart" size={22} color={colors.accent} />
            </View>
            <Text style={styles.premiumTitle}>You're already premium 💛</Text>
            <Text style={styles.premiumMessage}>
              No need to pay — you're one of our very first users, and this one's on us.
              Enjoy full access free for the next few months, on the house.
              {'\n\n'}Thank you for being here from the start.
            </Text>
            <TouchableOpacity
              style={styles.premiumButton}
              onPress={() => setPremiumSheetOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.premiumButtonText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── My Foods — "ping the admin" joke, with a real shared counter ────── */}
      <Modal visible={pingSheetOpen} transparent animationType="fade" onRequestClose={() => setPingSheetOpen(false)}>
        <Pressable style={styles.premiumBackdrop} onPress={() => setPingSheetOpen(false)}>
          <Pressable style={styles.premiumSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.premiumIconWrap}>
              <Ionicons name="notifications" size={22} color={colors.accent} />
            </View>
            <Text style={styles.premiumTitle}>Feature request filed 🚨</Text>
            <Text style={styles.premiumMessage}>
              "My Foods" isn't built yet, but the admin just felt that ping. 📳
              {'\n\n'}Keep tapping. He's counting every single one.
            </Text>
            <View style={styles.pingCounterWrap}>
              {pingLoading ? (
                <Text style={styles.pingCounterText}>Pinging...</Text>
              ) : pingErrorText ? (
                <Text style={styles.pingCounterError}>{pingErrorText}</Text>
              ) : (
                <Text style={styles.pingCounterText}>
                  Total pings: <Text style={styles.pingCounterNumber}>{pingCount ?? '—'}</Text>
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.premiumButton}
              onPress={handlePingAdmin}
              activeOpacity={0.85}
              disabled={pingLoading}
            >
              <Text style={styles.premiumButtonText}>Ping again</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Help & Support — funny, but makes clear the admin is reachable ──── */}
      <Modal visible={helpSheetOpen} transparent animationType="fade" onRequestClose={() => setHelpSheetOpen(false)}>
        <Pressable style={styles.premiumBackdrop} onPress={() => setHelpSheetOpen(false)}>
          <Pressable style={styles.premiumSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.premiumIconWrap}>
              <Ionicons name="call" size={22} color={colors.accent} />
            </View>
            <Text style={styles.premiumTitle}>Skip the ticket, just tell me 👋</Text>
            <Text style={styles.premiumMessage}>
              There's no support team here, just the person who built this app,
              reading every message himself.
              {'\n\n'}Found a bug? Have an idea? Send it my way, I actually read these.
            </Text>
            <TouchableOpacity
              style={styles.premiumButton}
              onPress={() => setHelpSheetOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.premiumButtonText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  inlineError: {
    fontSize: 12,
    color: C.error,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    backgroundColor: C.bg,
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 16,
  },
  panelInner: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  menuCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.shadowWarm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },

  // ── Go Premium sheet ──────────────────────────────────────────────────────
  premiumBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
  },
  premiumSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  premiumIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  premiumTitle: {
    fontSize: 17, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text,
    textAlign: 'center', marginBottom: 8,
  },
  premiumMessage: {
    fontSize: 14, fontFamily: fontFamily.regular, color: C.text2,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  premiumButton: {
    height: 46, borderRadius: 12, alignSelf: 'stretch',
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  premiumButtonText: {
    fontSize: 15, fontWeight: '700', fontFamily: fontFamily.bold, color: '#fff',
  },

  // ── My Foods "ping admin" counter ─────────────────────────────────────────
  pingCounterWrap: {
    alignSelf: 'stretch',
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  pingCounterText: {
    fontSize: 13, fontFamily: fontFamily.regular, color: C.text2,
  },
  pingCounterNumber: {
    fontFamily: fontFamily.bold, fontWeight: '700', color: colors.accent,
  },
  pingCounterError: {
    fontSize: 13, fontFamily: fontFamily.regular, color: C.error, textAlign: 'center',
    paddingHorizontal: 8,
  },
});
