import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  StatusBar,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography, fontFamily } from '../../theme/typography';
import BowlIllustration, { DESIGN_WIDTH, DESIGN_CANVAS_HEIGHT } from '../../components/common/BowlIllustration';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

// The illustration itself — bowl, arrows, callouts, and all the trigonometry
// that positions them — now lives in BowlIllustration so the splash screen can
// render the identical artwork. Only the values this screen needs to size and
// place that block remain here.

// No side margin: the illustration scales to the device's full width.
const SIDE_PADDING = 0;

// A deliberate nudge on top of bowlArea's centring, in DESIGN units so it scales
// with everything else rather than reading as "too much" on small screens and
// "too little" on large ones.
const DESIGN_ILLUSTRATION_UPWARD_SHIFT = 60;


export default function WelcomeScreen({ navigation }: Props) {
  // useWindowDimensions() reads the device's actual current screen size —
  // unlike a hardcoded number, this is correct on every phone, and updates
  // automatically if the window ever changes size (e.g. rotation).
  const { width: windowWidth } = useWindowDimensions();

  // bowlArea's height isn't knowable up front — it's whatever space is left
  // after the wordmark and buttons take theirs, which varies by device and
  // isn't derivable from useWindowDimensions() alone. onLayout fires once
  // React Native finishes measuring the real rendered size of a component
  // (similar to a container calling getPreferredSize() after layout, then
  // handing the result back) — recording that height here is what lets the
  // illustration scale down on short screens, or cap out instead of
  // growing into a huge empty-feeling block on tall ones.
  const [bowlAreaHeight, setBowlAreaHeight] = useState<number | null>(null);

  // Scales the whole design (bowl, arrows, callout text) down together as
  // one proportional unit — capped by BOTH the available width (so text
  // never clips) and the available height (so the illustration never ends
  // up small-and-floating inside a much bigger empty area on tall screens).
  const widthScale = Math.min(windowWidth - SIDE_PADDING * 2, DESIGN_WIDTH) / DESIGN_WIDTH;
  const heightScale = bowlAreaHeight != null ? bowlAreaHeight / DESIGN_CANVAS_HEIGHT : widthScale;
  const scale = Math.min(widthScale, heightScale);

  // Background is now a flat cream color (not a photo), so bars just need
  // off-black icons that read clearly against it — set directly here rather
  // than useScreenChrome since there's no shared screen-background constant
  // for this one-off color, and this screen never had useScreenChrome wired
  // up to begin with.
  useEffect(() => {
    StatusBar.setBarStyle('dark-content');
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync('dark');
    }
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.wordmarkArea}>
          <Text style={styles.wordmark}>STEADY</Text>
          <Text style={styles.tagline}>know every bite</Text>
        </View>

        <View style={styles.bowlArea} onLayout={(e) => setBowlAreaHeight(e.nativeEvent.layout.height)}>
          <BowlIllustration
            scale={scale}
            style={{ marginTop: -DESIGN_ILLUSTRATION_UPWARD_SHIFT * scale }}
          />
        </View>

        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Signup')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.ghostButtonText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  safeArea: { flex: 1 },
  wordmarkArea: {
    alignItems: 'center',
    // spacing.xxl (48) + spacing.md (16) — composed from the same spacing
    // scale every other screen uses, instead of a screen-specific fudge
    // number, so this stays consistent if that scale ever changes.
    paddingTop: spacing.xxl + spacing.md,
  },
  wordmark: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 8,
    color: '#2D2416',
    fontFamily: fontFamily.bold,
  },
  tagline: {
    marginTop: 0,
    fontSize: 26,
    color: '#B4A88E',
    fontFamily: fontFamily.handSemibold,
  },
  // Fills whatever space is left between the wordmark and the buttons, then
  // centers the (device-width-scaled) illustration inside it.
  bowlArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonArea: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    // Reduced from spacing.xxl (48) so the button block sits a bit closer
    // to the true bottom edge, while spacing.lg (24) still keeps it clear
    // of the home indicator / gesture bar that SafeAreaView already insets
    // for — this is padding on top of that safe-area inset, not instead of it.
    paddingBottom: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: typography.lg,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: 0.3,
  },
  ghostButton: {
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.6,
    borderColor: 'rgba(45,36,22,0.22)',
  },
  ghostButtonText: {
    color: '#2D2416',
    fontSize: typography.lg,
    fontWeight: '500',
    fontFamily: fontFamily.medium,
  },
});
