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

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// Unified object for convenience — screens can do `typography.lg` instead of `fontSize.lg`
export const typography = fontSize;
