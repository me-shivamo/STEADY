export const colors = {
  bgPrimary: '#FDF6EC',
  bgCard: '#FFFFFF',
  bgSurface: '#F5ECD8',

  accent: '#C8703A',
  accentLight: '#E8A87C',

  textPrimary: '#2D2016',
  textSecondary: '#8B6F47',
  textMuted: '#B8956A',

  success: '#4A8C5C',
  warning: '#D4860A',
  error: '#C0392B',

  shadowWarm: 'rgba(139, 90, 43, 0.10)',

  // Macro colors
  protein: '#4A7FA5',
  carbs: '#D4860A',
  fat: '#8B6F47',
} as const;

export type ColorKey = keyof typeof colors;
