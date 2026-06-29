export const colors = {
  // Surfaces & background
  bgPrimary: '#FAFAFA',
  bgCard: '#FFFFFF',
  bgSurface: '#FFFFFF',
  border: '#E8E8E8',

  // Text
  textPrimary: '#1D1D1F',
  textSecondary: '#6E6E73',
  textMuted: '#A1A1A6',

  // Brand / accent
  accent: '#6366F1',
  accentSoft: '#EDEDFC',
  accentLight: '#818CF8',

  // Macros
  protein: '#2F6FED',
  proteinSoft: '#E7EFFE',
  carbs: '#F5A623',
  carbsSoft: '#FEF3DF',
  fat: '#9B51E0',
  fatSoft: '#F3E9FC',

  // Status
  success: '#2FB67A',
  warning: '#F5A623',
  error: '#E5484D',

  // Shadows (as string values for use in shadowColor)
  shadowWarm: 'rgba(60, 40, 90, 0.08)',
  shadowWarmLg: 'rgba(60, 40, 90, 0.12)',
} as const;

export type ColorKey = keyof typeof colors;
