import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';

// A small deterministic palette so members without a saved avatar still get
// a stable, distinguishable colored initial instead of everyone showing the
// same neutral gray circle — mirrors the design's per-member color coding
// (GAvatar in steady-screens-e.jsx) without needing a color stored in the DB.
const INITIAL_COLORS = ['#6366F1', '#E5398A', '#F5A623', '#2FB67A', '#2F6FED', '#9B51E0'];

function colorForName(name: string | null): string {
  if (!name) return INITIAL_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[hash % INITIAL_COLORS.length];
}

interface GroupAvatarProps {
  name: string | null;
  avatarUrl?: string | null;
  size?: number;
  isYou?: boolean;
}

export default function GroupAvatar({ name, avatarUrl, size = 40, isYou = false }: GroupAvatarProps) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  const bg = colorForName(name);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        isYou && { borderWidth: 2, borderColor: C.accent },
      ]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[styles.initialFill, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
          <Text style={[styles.initialText, { fontSize: size * 0.42 }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
  },
  initialFill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: '#fff',
    fontWeight: '800',
    fontFamily: fontFamily.bold,
  },
});
