import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  StatusBar,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as NavigationBar from 'expo-navigation-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography, fontFamily } from '../../theme/typography';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

// Placeholder bowl photo carried over from the Claude Design splash concept —
// swap for a real STEADY-shot asset once Shivam provides one.
const BOWL_IMAGE_URI =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80&auto=format&fit=crop';

// Every number below is copied from the Claude Design splash file, which lays
// the bowl + callouts out on a 390-wide reference canvas (an iPhone 14/15
// standard width). DESIGN_WIDTH names that reference frame so the render
// code can scale it to whatever the real device's screen width is — see
// SIDE_PADDING and the `scale` calculation inside the component below.
const DESIGN_WIDTH = 390;
const DESIGN_CANVAS_HEIGHT = 480;
const DESIGN_BOWL_SIZE = 200;
const DESIGN_BOWL_CENTER_X = 195;

// How far to move the whole cluster (bowl + arrows + labels) up the canvas,
// as one rigid group. Every arrow is already derived from the bowl's center
// via polarPoint(), so shifting DESIGN_BOWL_CENTER_Y moves the arrows for
// free — but the label boxes in CALLOUTS below use independent fixed `top`
// values, so DESIGN_CLUSTER_SHIFT_Y is subtracted from those too, in the
// same spot they're defined, to keep the whole illustration moving as one
// unit instead of the bowl drifting away from its labels. Increase this
// number to move the cluster further up; 0 restores the original position.
const DESIGN_CLUSTER_SHIFT_Y = 40;

const DESIGN_BOWL_CENTER_Y = 300 - DESIGN_CLUSTER_SHIFT_Y;

// No side margin — the illustration now scales to the device's full screen
// width. (Was 24px; Shivam asked for it removed so the bowl+callouts use
// the whole width instead of sitting in a narrower centered strip.)
const SIDE_PADDING = 0;

// bowlArea still centers the illustration in the space between the wordmark
// and the buttons (confirmed correct as the anchor mechanism in an earlier
// round) — this is a deliberate nudge on top of that centered position, not
// a replacement for it, since Shivam wants the block visually higher.
//
// This is a DESIGN-space unit, same family as DESIGN_WIDTH/DESIGN_BOWL_SIZE
// above — it gets multiplied by `scale` before use, not applied as a raw
// pixel value. That's what makes it
// responsive: on a wider/taller screen where `scale` ends up bigger, the
// upward shift grows proportionally with the rest of the illustration
// instead of staying a fixed number of pixels that reads as "too much" or
// "too little" depending on device size — same reasoning as every other
// DESIGN_* constant in this file.
const DESIGN_ILLUSTRATION_UPWARD_SHIFT = 60;

// Single source of truth for the nutrient callouts, in DESIGN_WIDTH units.
// Each entry drives BOTH the label's canvas position AND its arrow's
// endpoint, so the two pieces can never drift apart the way two
// independently hand-copied coordinate lists would.
//
// Every arrow is defined by an ANGLE (degrees, 0 = straight up from bowl
// center, clockwise) rather than raw coordinates — the actual x/y start,
// control, and end points are all derived from that angle plus BOWL_RADIUS
// below, via polarPoint(). This guarantees two things that hand-picked
// coordinates couldn't: the tip always lands exactly on the bowl's edge
// (never underneath the image, which is what broke visibility two rounds
// ago), and the control point is always offset SIDEWAYS from the straight
// start->end line (via CURVE_BEND), which is what makes the shaft an actual
// curve instead of three collinear segments that render as a straight line.
const BOWL_RADIUS = DESIGN_BOWL_SIZE / 2;
const ARROW_GAP = 30; // distance from bowl edge to the arrow's start point
const ARROW_TIP_GAP = -15; // small gap so the tip doesn't visually touch the image
const CURVE_BEND = 20; // sideways offset of the control point — how curved the shaft looks

// A point at `radius` units from the bowl center, at `angleDeg` clockwise
// from straight up (12 o'clock = 0deg, 3 o'clock = 90deg, etc.) — the usual
// "compass bearing" convention, translated into screen x/y via sin/cos.
function polarPoint(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: DESIGN_BOWL_CENTER_X + radius * Math.sin(rad),
    y: DESIGN_BOWL_CENTER_Y - radius * Math.cos(rad),
  };
}

// Builds one arrow's [x1,y1, cx,cy, x2,y2] from a compass angle: start and
// end sit on the same ray from the bowl center (guaranteeing the tip lands
// on the edge), and the control point is nudged CURVE_BEND sideways —
// perpendicular to that ray — so the quadratic curve actually bows outward
// instead of running straight.
//
// `offsetX`/`offsetY` shift the WHOLE arrow (start, control, and end) sideways
// in flat screen-space, independent of the angle — this is what lets one
// specific arrow move left/right/up/down without touching the angle that
// controls which direction it points. Both default to 0, so any existing
// call site that doesn't pass them renders pixel-identical to before.
//
// `gapOverride` replaces the shared ARROW_GAP for this one arrow only — pass
// it to make a single arrow's shaft longer/shorter (start point further
// from or closer to the bowl) without changing ARROW_GAP for the other five.
// undefined (the default) means "use the shared ARROW_GAP", same as before.
function arrowFromAngle(
  angleDeg: number,
  bendDirection: 1 | -1,
  offsetX: number = 0,
  offsetY: number = 0,
  gapOverride?: number,
) {
  const gap = gapOverride ?? ARROW_GAP;
  const start = polarPoint(angleDeg, BOWL_RADIUS + gap);
  const end = polarPoint(angleDeg, BOWL_RADIUS + ARROW_TIP_GAP);
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  // Perpendicular to the start->end ray = the ray's own angle + 90deg.
  const perp = polarPoint(angleDeg + 90 * bendDirection, CURVE_BEND);
  const perpFromCenter = polarPoint(angleDeg + 90 * bendDirection, 0);
  const control = {
    x: mid.x + (perp.x - perpFromCenter.x),
    y: mid.y + (perp.y - perpFromCenter.y),
  };
  return [
    start.x + offsetX,
    start.y + offsetY,
    control.x + offsetX,
    control.y + offsetY,
    end.x + offsetX,
    end.y + offsetY,
  ] as const;
}

const CALLOUTS = [
  {
    key: 'calories',
    label: 'Calories',
    value: '≈ 420 kcal',
    color: colors.accent,
    arrowColor: '#B7AEDB',
    box: { left: 130, top: 120 - DESIGN_CLUSTER_SHIFT_Y, width: 130, alignItems: 'center' as const },
    arrow: arrowFromAngle(0, 1), // straight up from the label, curving right
  },
  {
    key: 'protein',
    label: 'Protein',
    value: '32 g',
    color: colors.protein,
    arrowColor: '#9FBEF2',
    box: { left: 10, top: 185 - DESIGN_CLUSTER_SHIFT_Y, width: 88, alignItems: 'flex-end' as const },
    arrow: arrowFromAngle(-45, -1, -25, 25, 50), // upper-left
  },
  {
    key: 'carbs',
    label: 'Carbs',
    value: '48 g',
    color: colors.carbs,
    arrowColor: '#E7BC7A',
    box: { left: 290, top: 188 - DESIGN_CLUSTER_SHIFT_Y, width: 88, alignItems: 'flex-start' as const },
    arrow: arrowFromAngle(45, 1, 0, 15), // upper-right
  },
  {
    key: 'vitamins',
    label: 'Vitamins',
    value: 'A · C · K',
    color: colors.vitamins,
    arrowColor: '#9FE0C0',
    box: { left: 14, top: 320, width: 92, alignItems: 'flex-end' as const },
    arrow: arrowFromAngle(-135, 1, -10, -30, 30), // lower-left
  },
  {
    key: 'fat',
    label: 'Healthy fat',
    value: '12 g',
    color: colors.fat,
    arrowColor: '#CFA9EC',
    box: { left: 284, top: 340, width: 92, alignItems: 'flex-start' as const },
    arrow: arrowFromAngle(135, -1, 0, -20, 40), // lower-right
  },
  {
    key: 'minerals',
    label: 'Minerals',
    value: 'iron + zinc',
    color: colors.minerals,
    arrowColor: '#F2B7A2',
    box: { left: 118, top: 390, width: 154, alignItems: 'center' as const },
    arrow: arrowFromAngle(180, 1), // straight down from the label, curving right
  },
];

// Turns [x1,y1, cx,cy, x2,y2] into an SVG path: a curved shaft from the start
// point through the control point to the tip, plus a small "V" chevron at
// the tip so it reads as an arrowhead. Same construction as the design
// file's own JS arrow() helper, translated into RN's SVG path syntax
// (identical "d" attribute format either way).
function arrowPath([x1, y1, cx, cy, x2, y2]: readonly number[]): string {
  const angle = Math.atan2(y2 - cy, x2 - cx);
  const headLen = 8;
  const spread = 0.55;
  const leftX = (x2 - headLen * Math.cos(angle - spread)).toFixed(1);
  const leftY = (y2 - headLen * Math.sin(angle - spread)).toFixed(1);
  const rightX = (x2 - headLen * Math.cos(angle + spread)).toFixed(1);
  const rightY = (y2 - headLen * Math.sin(angle + spread)).toFixed(1);
  return `M${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2} M${leftX} ${leftY} L ${x2} ${y2} L ${rightX} ${rightY}`;
}

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
          <View
            style={{
              width: DESIGN_WIDTH * scale,
              height: DESIGN_CANVAS_HEIGHT * scale,
              marginTop: -DESIGN_ILLUSTRATION_UPWARD_SHIFT * scale,
            }}
          >
            <Image
              source={{ uri: BOWL_IMAGE_URI }}
              style={[
                styles.bowlImage,
                {
                  left: (DESIGN_BOWL_CENTER_X - DESIGN_BOWL_SIZE / 2) * scale,
                  top: (DESIGN_BOWL_CENTER_Y - DESIGN_BOWL_SIZE / 2) * scale,
                  width: DESIGN_BOWL_SIZE * scale,
                  height: DESIGN_BOWL_SIZE * scale,
                  borderRadius: (DESIGN_BOWL_SIZE * scale) / 2,
                },
              ]}
            />

            {/* Drawn after the bowl image so arrow tips (pulled inward via a
                negative ARROW_TIP_GAP) render on top of the image instead of
                being painted over by it. */}
            <Svg
              style={StyleSheet.absoluteFill}
              viewBox={`0 0 ${DESIGN_WIDTH} ${DESIGN_CANVAS_HEIGHT}`}
            >
              {CALLOUTS.map((c) => (
                <Path
                  key={c.key}
                  d={arrowPath(c.arrow)}
                  stroke={c.arrowColor}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>

            {CALLOUTS.map((c) => (
              <View
                key={c.key}
                style={[
                  styles.anno,
                  {
                    left: c.box.left * scale,
                    top: c.box.top * scale,
                    width: c.box.width * scale,
                    alignItems: c.box.alignItems,
                  },
                ]}
              >
                <Text style={[styles.annoLabel, { color: c.color, fontSize: 26 * scale, lineHeight: 26 * scale }]}>
                  {c.label}
                </Text>
                <Text style={[styles.annoValue, { fontSize: 18 * scale, lineHeight: 18 * scale }]}>{c.value}</Text>
              </View>
            ))}
          </View>
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
  bowlImage: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#46270F',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  anno: {
    position: 'absolute',
  },
  annoLabel: {
    fontFamily: fontFamily.handBold,
  },
  annoValue: {
    marginTop: 3,
    color: '#8A7F6A',
    fontFamily: fontFamily.handSemibold,
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
