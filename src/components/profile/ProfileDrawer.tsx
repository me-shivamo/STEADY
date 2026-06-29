import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { homeColors as C } from '../../theme/homeColors';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
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
  action: 'comingSoon' | 'signOut' | 'navigate';
  screen?: keyof AppStackParamList;
};

const MENU: MenuItem[] = [
  { icon: 'bar-chart-outline', label: 'Progress Charts', action: 'comingSoon' },
  { icon: 'scale-outline',     label: 'Weight',          action: 'navigate', screen: 'Weight' },
  { icon: 'water-outline',     label: 'Water',           action: 'comingSoon' },
  { icon: 'body-outline',      label: 'Body Measurements', action: 'comingSoon' },
  { icon: 'restaurant-outline', label: 'My Foods', badge: 'Learned 12 foods', action: 'comingSoon' },
  { icon: 'notifications-outline', label: 'Reminders',   action: 'comingSoon' },
  { icon: 'people-outline',    label: 'Groups',          action: 'comingSoon' },
  { icon: 'gift-outline',      label: 'Refer a Friend',  action: 'comingSoon' },
  { icon: 'settings-outline',  label: 'Settings',        action: 'navigate', screen: 'Settings' },
  { icon: 'help-circle-outline', label: 'Help & Support', action: 'comingSoon' },
  { icon: 'star-outline',      label: 'Go Premium', variant: 'premium', action: 'comingSoon' },
  { icon: 'log-out-outline',   label: 'Sign Out',   variant: 'destructive', action: 'signOut' },
];

export default function ProfileDrawer({ open, onClose }: ProfileDrawerProps) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const signOut = useAuthStore((s) => s.signOut);

  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(open);
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
    onClose();
    try {
      await signOut();
    } catch {
      signingOut.current = false;
      Alert.alert('Could not sign out', 'Please try again.');
    }
  };

  const handlePress = (item: MenuItem) => {
    if (item.action === 'signOut') {
      handleSignOut();
    } else if (item.action === 'navigate' && item.screen) {
      // Close drawer first so it doesn't show behind the new screen
      onClose();
      navigation.navigate(item.screen);
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
