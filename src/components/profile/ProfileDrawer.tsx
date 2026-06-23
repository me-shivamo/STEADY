import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import ProfileHeaderCard from './ProfileHeaderCard';
import StatStrip from './StatStrip';
import MenuRow, { MenuRowVariant } from './MenuRow';

/**
 * Slide-out profile drawer — an in-screen overlay (not a navigation route).
 *
 * Architecture: this is a UI-layer component rendered at the root of HomeScreen.
 * When `open` flips true it mounts a full-screen absolute layer (dimmed backdrop +
 * left panel) over the feed. A single Animated.Value (0=closed, 1=open) drives both
 * the panel's translateX (off-screen-left → in-place) and the backdrop opacity,
 * using the core Animated API with useNativeDriver — the Expo Go-safe path.
 *
 * Data: pure consumer of the auth store. Sign Out is the only wired action this
 * pass; the other menu rows show a "coming soon" notice until their screens exist.
 */

const PANEL_WIDTH = Math.min(Dimensions.get('window').width * 0.88, 360);
const ANIM_MS = 280;

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenWeight: () => void;
}

type MenuItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: string;
  variant?: MenuRowVariant;
  action: 'comingSoon' | 'signOut' | 'openSettings' | 'openWeight';
};

const MENU: MenuItem[] = [
  { icon: 'bar-chart-outline', label: 'Progress Charts', action: 'comingSoon' },
  { icon: 'scale-outline', label: 'Weight', action: 'openWeight' },
  { icon: 'water-outline', label: 'Water', action: 'comingSoon' },
  { icon: 'body-outline', label: 'Body Measurements', action: 'comingSoon' },
  { icon: 'restaurant-outline', label: 'My Foods', badge: 'Learned 12 foods', action: 'comingSoon' },
  { icon: 'notifications-outline', label: 'Reminders', action: 'comingSoon' },
  { icon: 'people-outline', label: 'Groups', action: 'comingSoon' },
  { icon: 'gift-outline', label: 'Refer a Friend', action: 'comingSoon' },
  { icon: 'settings-outline', label: 'Settings', action: 'openSettings' },
  { icon: 'help-circle-outline', label: 'Help & Support', action: 'comingSoon' },
  { icon: 'star-outline', label: 'Go Premium', variant: 'premium', action: 'comingSoon' },
  { icon: 'log-out-outline', label: 'Sign Out', variant: 'destructive', action: 'signOut' },
];

export default function ProfileDrawer({ open, onClose, onOpenSettings, onOpenWeight }: ProfileDrawerProps) {
  const signOut = useAuthStore((s) => s.signOut);

  // 0 = fully closed, 1 = fully open. Drives translateX + backdrop opacity.
  const progress = useRef(new Animated.Value(0)).current;

  // Keep the overlay mounted through the closing animation, then unmount.
  const [visible, setVisible] = useState(open);

  // Guards against a double-tap firing two sign-outs while the tree swaps.
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
    // No confirmation dialog — tapping Sign Out logs the user out immediately.
    // Ignore a second tap while the first is already tearing down.
    if (signingOut.current) return;
    signingOut.current = true;

    // Close the drawer first; signOut() clears state synchronously, so the
    // navigator swap to the welcome screen lands cleanly with no freeze.
    onClose();
    try {
      await signOut();
    } catch (e) {
      // Local-first signOut shouldn't reject, but if it ever does we don't
      // strand the user in a half-signed-out state — reset the guard.
      signingOut.current = false;
      Alert.alert('Could not sign out', 'Please try again.');
    }
  };

  const handlePress = (item: MenuItem) => {
    if (item.action === 'signOut') {
      handleSignOut();
    } else if (item.action === 'openSettings') {
      onClose();
      onOpenSettings();
    } else if (item.action === 'openWeight') {
      onClose();
      onOpenWeight();
    } else {
      Alert.alert(item.label, 'Coming soon — this feature is on the way.');
    }
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
            <StatStrip />

            {/* Menu card — one rounded surface, rows divided by hairlines */}
            <View style={styles.menuCard}>
              {MENU.map((item, i) => (
                <MenuRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  badge={item.badge}
                  variant={item.variant}
                  showDivider={i < MENU.length - 1}
                  onPress={() => handlePress(item)}
                />
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    backgroundColor: C.bg,
    // shadow on the right edge of the panel
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
});
