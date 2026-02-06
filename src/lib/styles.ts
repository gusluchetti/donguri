/**
 * Design tokens for donguri.
 *
 * Inspired by warm, earthy tones (donguri = acorn).
 * Dark theme with amber/ochre accents.
 */

export const colors = {
  bg: "#0f0e0c",
  bgSurface: "#1a1815",
  bgElevated: "#242119",
  bgHover: "#2e2a21",
  border: "#3d3628",
  borderSubtle: "#2e2a21",
  text: "#e8e0d4",
  textSecondary: "#a8997f",
  textTertiary: "#776b57",
  accent: "#d4a44a",
  accentHover: "#e0b660",
  accentMuted: "#8b6d2e",
  // Type badges
  movie: "#c17a50",
  tvSeries: "#5a8fa0",
  anime: "#c25d7e",
  game: "#6a9f5a",
} as const;

export const fonts = {
  mono: "'IBM Plex Mono', 'SF Mono', 'Fira Code', monospace",
  sans: "'IBM Plex Sans', -apple-system, system-ui, sans-serif",
} as const;
