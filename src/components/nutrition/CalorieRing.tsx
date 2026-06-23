import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Gradient colors match the design exactly: #818CF8 → #6366F1
const GRAD_START = '#818CF8';
const GRAD_END = '#6366F1';
const TRACK_COLOR = '#EEEDF4'; // design --surface

interface Props {
  eaten: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
}

export default function CalorieRing({ eaten, goal, size = 116, strokeWidth = 11 }: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(eaten / goal, 1);
  const targetOffset = circumference * (1 - pct);

  const animOffset = useRef(new Animated.Value(circumference)).current;

  useEffect(() => {
    Animated.timing(animOffset, {
      toValue: targetOffset,
      duration: 1100,
      useNativeDriver: false,
    }).start();
  }, [eaten, goal]);

  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id="calRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={GRAD_START} />
            <Stop offset="100%" stopColor={GRAD_END} />
          </LinearGradient>
        </Defs>
        {/* background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TRACK_COLOR}
          strokeWidth={strokeWidth}
        />
        {/* animated progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#calRingGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animOffset as any}
        />
      </Svg>
      {/* center label */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={styles.num}>{eaten.toLocaleString()}</Text>
        <Text style={styles.label}>eaten</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1D1D1F',
    lineHeight: 26,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#6E6E73',
    marginTop: 3,
  },
});
