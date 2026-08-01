export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 15,
  xl: 17,
  xxl: 21,
  display: 26,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// React Native doesn't derive a bold/medium variant from a single font file the way
// CSS does — each weight is a separate font file, so fontWeight and fontFamily must
// always be set together, keyed off the same name.
export const fontFamily = {
  regular: 'TikTokSans_400Regular',
  medium: 'TikTokSans_500Medium',
  semibold: 'TikTokSans_600SemiBold',
  bold: 'TikTokSans_700Bold',
  // Handwritten accent face — used sparingly for tagline/annotation-style text
  // (e.g. the Welcome screen's nutrient callouts), never for body copy.
  handMedium: 'Caveat_500Medium',
  handSemibold: 'Caveat_600SemiBold',
  handBold: 'Caveat_700Bold',
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// Unified object for convenience — screens can do `typography.lg` instead of `fontSize.lg`
export const typography = fontSize;
