import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
// How many rows to keep mounted on each side of the centred one. With a ±8
// window we mount ~17 <Text> nodes instead of all N (e.g. 221 for weight),
// which is what kills the scroll jank. Generous enough that you can't flick
// past the rendered edge before the window re-centres on momentum end.
const WINDOW = 8;

interface Props {
  values: (string | number)[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  label?: string;
  style?: ViewStyle;
}

// One row. Memoised so windowing / parent re-renders never re-render a row
// whose props are unchanged. The opacity + scale fade is bound to `scrollY`
// (an Animated.Value fed by the ScrollView's native-driven onScroll) via
// interpolate — opacity and transform are native-driver-safe, so the fade runs
// on the UI thread with zero per-frame JS. No Reanimated needed, which keeps
// the component runnable inside Expo Go.
const PickerRow = React.memo(function PickerRow({
  value,
  index,
  scrollY,
}: {
  value: string | number;
  index: number;
  scrollY: Animated.Value;
}) {
  const centre = index * ITEM_HEIGHT;
  const inputRange = [
    centre - ITEM_HEIGHT * 2,
    centre - ITEM_HEIGHT,
    centre,
    centre + ITEM_HEIGHT,
    centre + ITEM_HEIGHT * 2,
  ];
  const opacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.2, 0.45, 1, 0.45, 0.2],
    extrapolate: 'clamp',
  });
  const scale = scrollY.interpolate({
    inputRange,
    outputRange: [0.85, 0.92, 1, 0.92, 0.85],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.item, { top: index * ITEM_HEIGHT }]}>
      <Animated.Text style={[styles.itemText, { opacity, transform: [{ scale }] }]}>
        {value}
      </Animated.Text>
    </View>
  );
});

// DrumPicker — a wheel/drum selector. Uses React Native's core Animated API
// (not Reanimated) so it runs inside Expo Go, with the fade driven on the
// native thread via useNativeDriver, and only a window of rows mounted for
// virtualization. Public props are unchanged from prior implementations.
export default function DrumPicker({
  values,
  selectedIndex,
  onIndexChange,
  label,
  style,
}: Props) {
  const paddingOffset = Math.floor(VISIBLE_ITEMS / 2);
  // Animated.Value persists across renders via useRef. Seeded at the initial
  // selected offset so the fade is correct on first paint.
  const scrollY = useRef(new Animated.Value(selectedIndex * ITEM_HEIGHT)).current;

  // Which rows are currently mounted. Updated only when the wheel settles, so
  // this state change is rare and cheap — never per-frame.
  const [centreIndex, setCentreIndex] = useState(selectedIndex);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY]
  );

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const rawIndex = Math.round(offsetY / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(values.length - 1, rawIndex));
      setCentreIndex(clampedIndex);
      if (clampedIndex !== selectedIndex) {
        onIndexChange(clampedIndex);
      }
    },
    [values.length, selectedIndex, onIndexChange]
  );

  // The slice of rows to actually render: centreIndex ± WINDOW, clamped.
  const windowStart = Math.max(0, centreIndex - WINDOW);
  const windowEnd = Math.min(values.length, centreIndex + WINDOW + 1);
  const visibleRows = useMemo(() => {
    const rows: { value: string | number; index: number }[] = [];
    for (let i = windowStart; i < windowEnd; i++) {
      rows.push({ value: values[i], index: i });
    }
    return rows;
  }, [values, windowStart, windowEnd]);

  // Total scrollable height stays N * ITEM_HEIGHT regardless of windowing, so
  // snapToInterval math and the contentOffset never change. Rows are absolutely
  // positioned by their real index inside this full-height canvas.
  const contentHeight = values.length * ITEM_HEIGHT + ITEM_HEIGHT * paddingOffset * 2;

  return (
    <View style={[styles.container, style]}>
      {/* Centre highlight band — the visual "slot" */}
      <View style={styles.selectionBand} pointerEvents="none" />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
        onScroll={onScroll}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={styles.scroll}
        nestedScrollEnabled
      >
        {/* Full-height spacer canvas; absolutely-positioned rows sit on top.
            The paddingOffset shift centres index 0 in the slot. */}
        <View style={{ height: contentHeight }}>
          <View style={{ top: ITEM_HEIGHT * paddingOffset }}>
            {visibleRows.map((row) => (
              <PickerRow key={row.index} value={row.value} index={row.index} scrollY={scrollY} />
            ))}
          </View>
        </View>
      </Animated.ScrollView>

      {label ? (
        <View style={styles.labelContainer} pointerEvents="none">
          <Text style={styles.label}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: PICKER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
  },
  scroll: {
    width: '100%',
  },
  item: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  selectionBand: {
    position: 'absolute',
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    zIndex: 0,
  },
  labelContainer: {
    position: 'absolute',
    right: 16,
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
