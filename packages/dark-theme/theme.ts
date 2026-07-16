export type Theme = {
  // 1 inverts toward the dark scheme; 0 leaves polarity alone (used for the
  // adjustment-only filter matrix applied on top of remapped colors).
  mode: 0 | 1;
  brightness: number;
  contrast: number;
  grayscale: number;
  sepia: number;
  backgroundColor: string;
  textColor: string;
};

export function getThemeValueKey(theme: Theme): string {
  return `${theme.mode};${theme.brightness};${theme.contrast};${theme.grayscale};${theme.sepia};${theme.backgroundColor};${theme.textColor}`;
}

export const DEFAULT_THEME: Theme = {
  mode: 1,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  sepia: 0,
  backgroundColor: "#181a1b",
  textColor: "#e8e6e3",
};
