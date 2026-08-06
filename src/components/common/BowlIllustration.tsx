import React from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';

/**
 * The bowl-and-callouts illustration: a photo of a bowl ringed by six curved
 * arrows pointing to handwritten nutrient labels.
 *
 * WHY IT'S A COMPONENT
 * --------------------
 * It was inline in WelcomeScreen. The splash screen now needs the identical
 * artwork, and the geometry below took seven rounds of on-device tuning to get
 * right — duplicating ~150 lines of trigonometry into a second file would
 * guarantee the two drift apart the first time either is adjusted. One source,
 * two call sites.
 *
 * THE BOWL PHOTO IS NOW A BUNDLED ASSET
 * -------------------------------------
 * It used to be a remote Unsplash URL. That is fatal for a splash screen (it
 * would render an empty circle until the network returned) and merely bad for
 * the Welcome screen (a blank first impression on a slow connection). Bundling
 * it costs 76 KB and makes both work offline.
 */

// Everything below is in DESIGN units — a 390-wide reference canvas, the width
// of an iPhone 14/15. Callers multiply by `scale` to fit the real device.
export const DESIGN_WIDTH = 390;
export const DESIGN_CANVAS_HEIGHT = 480;
const DESIGN_BOWL_SIZE = 200;
const DESIGN_BOWL_CENTER_X = 195;

// Moves the whole cluster (bowl + arrows + labels) up the canvas as one rigid
// group. Arrows derive from the bowl centre via polarPoint() so they follow for
// free; the label boxes use independent `top` values, so this is subtracted
// there too, keeping the illustration moving as a unit.
const DESIGN_CLUSTER_SHIFT_Y = 40;
const DESIGN_BOWL_CENTER_Y = 300 - DESIGN_CLUSTER_SHIFT_Y;

const BOWL_RADIUS = DESIGN_BOWL_SIZE / 2;
const ARROW_GAP = 30;        // distance from bowl edge to the arrow's start
const ARROW_TIP_GAP = -15;   // negative: tips overlap the image slightly
const CURVE_BEND = 20;       // sideways offset of the control point

const BOWL_IMAGE = require('../../../assets/bowl.jpg');

/** A point `radius` units from the bowl centre at `angleDeg` clockwise from 12 o'clock. */
function polarPoint(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: DESIGN_BOWL_CENTER_X + radius * Math.sin(rad),
    y: DESIGN_BOWL_CENTER_Y - radius * Math.cos(rad),
  };
}

/**
 * Builds one arrow's [x1,y1, cx,cy, x2,y2] from a compass angle. Start and end
 * sit on the same ray from the bowl centre (so the tip always lands on the
 * edge), and the control point is nudged CURVE_BEND perpendicular to that ray —
 * which is what makes the shaft an actual curve rather than three collinear
 * points rendering as a straight line.
 */
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
  const perp = polarPoint(angleDeg + 90 * bendDirection, CURVE_BEND);
  const perpFromCenter = polarPoint(angleDeg + 90 * bendDirection, 0);
  const control = {
    x: mid.x + (perp.x - perpFromCenter.x),
    y: mid.y + (perp.y - perpFromCenter.y),
  };
  return [
    start.x + offsetX, start.y + offsetY,
    control.x + offsetX, control.y + offsetY,
    end.x + offsetX, end.y + offsetY,
  ] as const;
}

// Single source of truth for the callouts: each entry drives BOTH the label's
// position AND its arrow's endpoint, so the two can never drift apart the way
// two hand-copied coordinate lists would.
const CALLOUTS = [
  {
    key: 'calories', label: 'Calories', value: '≈ 420 kcal',
    color: colors.accent, arrowColor: '#B7AEDB',
    box: { left: 130, top: 120 - DESIGN_CLUSTER_SHIFT_Y, width: 130, alignItems: 'center' as const },
    arrow: arrowFromAngle(0, 1),
  },
  {
    key: 'protein', label: 'Protein', value: '32 g',
    color: colors.protein, arrowColor: '#9FBEF2',
    box: { left: 10, top: 185 - DESIGN_CLUSTER_SHIFT_Y, width: 88, alignItems: 'flex-end' as const },
    arrow: arrowFromAngle(-45, -1, -25, 25, 50),
  },
  {
    key: 'carbs', label: 'Carbs', value: '48 g',
    color: colors.carbs, arrowColor: '#E7BC7A',
    box: { left: 290, top: 188 - DESIGN_CLUSTER_SHIFT_Y, width: 88, alignItems: 'flex-start' as const },
    arrow: arrowFromAngle(45, 1, 0, 15),
  },
  {
    key: 'vitamins', label: 'Vitamins', value: 'A · C · K',
    color: colors.vitamins, arrowColor: '#9FE0C0',
    box: { left: 14, top: 320, width: 92, alignItems: 'flex-end' as const },
    arrow: arrowFromAngle(-135, 1, -10, -30, 30),
  },
  {
    key: 'fat', label: 'Healthy fat', value: '12 g',
    color: colors.fat, arrowColor: '#CFA9EC',
    box: { left: 284, top: 340, width: 92, alignItems: 'flex-start' as const },
    arrow: arrowFromAngle(135, -1, 0, -20, 40),
  },
  {
    key: 'minerals', label: 'Minerals', value: 'iron + zinc',
    color: colors.minerals, arrowColor: '#F2B7A2',
    box: { left: 118, top: 390, width: 154, alignItems: 'center' as const },
    arrow: arrowFromAngle(180, 1),
  },
];

/**
 * Turns [x1,y1, cx,cy, x2,y2] into an SVG path: a curved shaft plus a small "V"
 * chevron at the tip so it reads as an arrowhead.
 */
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

interface Props {
  /** Multiplier from DESIGN units to real pixels. */
  scale: number;
  style?: StyleProp<ViewStyle>;
}

export default function BowlIllustration({ scale, style }: Props) {
  return (
    <View
      style={[
        { width: DESIGN_WIDTH * scale, height: DESIGN_CANVAS_HEIGHT * scale },
        style,
      ]}
    >
      <Image
        source={BOWL_IMAGE}
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

      {/* Drawn after the image so the arrow tips (pulled inward by the negative
          ARROW_TIP_GAP) render on top of it rather than being painted over. */}
      <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${DESIGN_WIDTH} ${DESIGN_CANVAS_HEIGHT}`}>
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
  );
}

const styles = StyleSheet.create({
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
  anno: { position: 'absolute' },
  annoLabel: { fontFamily: fontFamily.handBold },
  annoValue: { marginTop: 3, color: '#8A7F6A', fontFamily: fontFamily.handSemibold },
});
