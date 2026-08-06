import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { fontFamily } from '../../theme/typography';
import BowlIllustration, { DESIGN_WIDTH, DESIGN_CANVAS_HEIGHT } from './BowlIllustration';

/**
 * The branded splash — STEADY wordmark, tagline, and the full bowl-and-callouts
 * illustration, matching the Welcome screen exactly.
 *
 * WHY THIS EXISTS RATHER THAN JUST A BIGGER SPLASH IMAGE
 * ------------------------------------------------------
 * The native splash cannot show this. Android 12+ renders it through
 * `windowSplashScreenAnimatedIcon` (see android/app/src/main/res/values/styles.xml),
 * and the system masks that image to a circle exposing only the inner ~2/3 of
 * the canvas. Six labels spread across a 390x480 illustration get cropped away —
 * it is an OS behaviour, not a setting. So the native splash shows the bowl
 * alone (the one element that survives a circular mask), and this component
 * takes over the instant JS boots to show the artwork in full.
 *
 * The handover is designed to be invisible: same #FAFAFA background, same bowl,
 * same position. What the user perceives is one splash where the labels fade in.
 *
 * Uses core Animated with useNativeDriver rather than Reanimated — project
 * convention, since native module versions must match the Expo SDK 54 set.
 */

interface Props {
  /** Flip to true when the app is ready; the splash then fades out and unmounts. */
  isAppReady: boolean;
  /** Called once the fade-out finishes, so the parent can stop rendering this. */
  onFinish: () => void;
}

// Long enough that the illustration registers as a deliberate brand moment
// rather than a flicker, short enough not to feel like a loading screen.
const MINIMUM_VISIBLE_MS = 1400;
const FADE_MS = 420;

export default function AnimatedSplash({ isAppReady, onFinish }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(1)).current;
  // Content fades UP slightly as it appears — the same easing the app uses
  // elsewhere, so the splash feels part of the product rather than bolted on.
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  useEffect(() => {
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => setMinimumElapsed(true), MINIMUM_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [contentOpacity]);

  useEffect(() => {
    // Both conditions: the app being ready early must not cut the brand moment
    // short, and the timer elapsing early must not reveal a half-loaded app.
    if (!isAppReady || !minimumElapsed) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinish();
    });
  }, [isAppReady, minimumElapsed, opacity, onFinish]);

  // Same scale maths as the Welcome screen, so the bowl lands in the same place
  // and the handover doesn't jump. Height is approximated from the window rather
  // than measured with onLayout: a splash has no competing content to measure
  // against, and waiting a frame for onLayout would show an empty screen first.
  const widthScale = Math.min(windowWidth, DESIGN_WIDTH) / DESIGN_WIDTH;
  const heightScale = (windowHeight * 0.62) / DESIGN_CANVAS_HEIGHT;
  const scale = Math.min(widthScale, heightScale);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity }]}>
      <Animated.View style={[styles.inner, { opacity: contentOpacity }]}>
        <View style={styles.wordmarkArea}>
          <Text style={styles.wordmark}>STEADY</Text>
          <Text style={styles.tagline}>know every bite</Text>
        </View>

        <View style={styles.bowlArea}>
          <BowlIllustration scale={scale} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgPrimary,
    // Above everything, including the navigator underneath that is already
    // mounting behind it.
    zIndex: 999,
    elevation: 999,
  },
  inner: { flex: 1 },
  wordmarkArea: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
  },
  wordmark: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 8,
    color: '#2D2416',
    fontFamily: fontFamily.bold,
  },
  tagline: {
    fontSize: 26,
    color: '#B4A88E',
    fontFamily: fontFamily.handSemibold,
  },
  bowlArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
