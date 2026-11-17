/**
 * The shell's colour, behind the titlebar and the strip, light and dark. The
 * `--shell` token in `src/ui/styles.css` holds the same two values, which a
 * test keeps equal.
 */
export const SHELL_GREY = {
  light: "oklch(0.94 0 0)",
  dark: "#1d1d1d",
} as const;

const OKLCH = /^oklch\((?<l>[\d.]+) (?<c>[\d.]+) (?<h>[\d.]+)\)$/u;

const toSrgbByte = (linear: number) => {
  const encoded =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
};

/** `#rrggbb` for an `oklch(l c h)` or a hex colour, which Electron reads. */
export const toHex = (color: string) => {
  const groups = OKLCH.exec(color)?.groups;

  if (!groups) {
    return color;
  }

  const lightness = Number(groups.l);
  const chroma = Number(groups.c);
  const hue = (Number(groups.h) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return `#${[
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
    .map((channel) => toSrgbByte(channel).toString(16).padStart(2, "0"))
    .join("")}`;
};

/** The window's own colour, which shows before the shell paints and as it resizes. */
export const windowBackground = (isDark: boolean) =>
  toHex(isDark ? SHELL_GREY.dark : SHELL_GREY.light);
