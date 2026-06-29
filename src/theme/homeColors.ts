// ── Home-surface design tokens (mapped from CSS vars in Claude Design) ─────────
// Shared by HomeScreen and any UI that overlays it (e.g. the profile drawer) so
// the accent-soft pills, surfaces, and borders line up exactly. These intentionally
// differ from src/theme/colors.ts in a few shades (accentSoft, border, error) and
// add `accentPressed`/`surface`/`divider`; reconciling the two palettes repo-wide
// is a separate cleanup. Until then, anything living on the Home surface uses this.
export const homeColors = {
  bg: '#F7F6FB',
  card: '#FFFFFF',
  surface: '#EEEDF4',
  accent: '#6366F1',
  accentSoft: '#ECEAFE',
  accentPressed: '#818CF8',
  text: '#1D1D1F',
  text2: '#6E6E73',
  muted: '#A1A1A6',
  border: '#E4E2EC',
  protein: '#2F6FED',
  carbs: '#F5A623',
  fat: '#9B51E0',
  divider: '#E5E5EA',
  error: '#FF3B30',
} as const;

export type HomeColorKey = keyof typeof homeColors;
