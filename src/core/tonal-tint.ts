import { clamp, memoize } from "es-toolkit";

/** The light or dark palette, as the effective theme picks it. */
export type TonalTheme = "light" | "dark";

/**
 * The shadcn tokens the profile tint gives a profile's colour of its own,
 * `--shell` included; the page's `--background` is never one of them.
 */
export const TONAL_ROLES = [
  "shell",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
  "input",
  "ring",
] as const;

export type TonalRole = (typeof TONAL_ROLES)[number];

/** Each role's colour as `#rrggbb`. */
export type TonalTokens = Record<TonalRole, string>;

type Tone = readonly [lightness: number, chroma: number];

type Surface =
  | "shell"
  | "muted"
  | "secondary"
  | "card"
  | "popover"
  | "accent"
  | "border"
  | "background";

/**
 * The tone each role aims for, in OKLCH, the profile's hue its own; the
 * prototype's Balanced strength (Tim, 27 November 2026). A foreground is a
 * target the contrast step may push further from its surfaces.
 */
const TONES: Record<TonalTheme, Record<TonalRole | "background", Tone>> = {
  light: {
    shell: [0.925, 0.04],
    muted: [0.893, 0.052],
    secondary: [0.865, 0.068],
    card: [0.97, 0.028],
    popover: [0.97, 0.028],
    accent: [0.925, 0.048],
    border: [0.855, 0.04],
    background: [1, 0],
    foreground: [0.205, 0.04],
    "muted-foreground": [0.425, 0.055],
    "secondary-foreground": [0.225, 0.05],
    "accent-foreground": [0.205, 0.04],
    "card-foreground": [0.19, 0.035],
    "popover-foreground": [0.19, 0.035],
    primary: [0.455, 0.17],
    "primary-foreground": [0.988, 0.016],
    ring: [0.525, 0.16],
    input: [0.56, 0.06],
  },
  dark: {
    shell: [0.285, 0.035],
    muted: [0.335, 0.042],
    secondary: [0.385, 0.052],
    card: [0.235, 0.028],
    popover: [0.235, 0.028],
    accent: [0.335, 0.042],
    border: [0.4, 0.032],
    background: [0.145, 0],
    foreground: [0.97, 0.018],
    "muted-foreground": [0.76, 0.04],
    "secondary-foreground": [0.97, 0.018],
    "accent-foreground": [0.97, 0.018],
    "card-foreground": [0.965, 0.02],
    "popover-foreground": [0.965, 0.02],
    primary: [0.815, 0.13],
    "primary-foreground": [0.22, 0.04],
    ring: [0.7, 0.15],
    input: [0.58, 0.05],
  },
};

/**
 * How far a surface may leave its lightness to keep its chroma: near white
 * and near black sRGB holds little chroma, and how little depends on the
 * hue, so a blue frame sits a shade darker than a green one to be as
 * coloured, as Chrome's own themes do.
 */
const MOVE: Record<Surface, number> = {
  shell: 0.05,
  muted: 0.05,
  secondary: 0.06,
  accent: 0.05,
  border: 0.05,
  card: 0.015,
  popover: 0.015,
  background: 0,
};

const STEP = 0.005;
/** How many steps a foreground or the primary may move to meet its ratio. */
const MOST_STEPS = 120;
const DEGREE = Math.PI / 180;

type Triple = readonly [number, number, number];

const encode = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

const decode = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const oklabToLinear = (lightness: number, a: number, b: number): Triple => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

const linearToOklab = ([red, green, blue]: Triple): Triple => {
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  );

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/** Within sRGB, allowing the rounding of the conversion. */
const inGamut = (linear: Triple) =>
  linear.every((channel) => channel >= -0.0004 && channel <= 1.0004);

const linearAt = (lightness: number, chroma: number, hue: number) =>
  oklabToLinear(
    lightness,
    chroma * Math.cos(hue * DEGREE),
    chroma * Math.sin(hue * DEGREE)
  );

/** Halves the chroma range `rounds` times for the most `hue` holds there. */
const fittingChroma = (
  lightness: number,
  hue: number,
  most: number,
  rounds: number
) => {
  let low = 0;
  let high = most;

  for (let round = 0; round < rounds; round += 1) {
    const middle = (low + high) / 2;

    if (inGamut(linearAt(lightness, middle, hue))) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
};

/** An OKLCH tone as `#rrggbb`, its chroma reduced until sRGB holds it. */
const hexOf = (lightness: number, chroma: number, hue: number) => {
  const held = inGamut(linearAt(lightness, chroma, hue))
    ? chroma
    : fittingChroma(lightness, hue, chroma, 22);

  return `#${linearAt(lightness, held, hue)
    .map((channel) =>
      Math.round(encode(clamp(channel, 0, 1)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

/** The most chroma `hue` can hold at `lightness` in sRGB. */
const maxChroma = (lightness: number, hue: number) =>
  fittingChroma(lightness, hue, 0.45, 20);

const channelsOf = (hex: string): Triple => {
  const value = Number.parseInt(hex.slice(1), 16);

  // oxlint-disable-next-line no-bitwise -- the bytes of a packed colour
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const luminance = (hex: string) => {
  const [red, green, blue] = channelsOf(hex).map((channel) =>
    decode(channel / 255)
  ) as unknown as Triple;

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** WCAG's contrast ratio of two `#rrggbb` colours. */
export const contrastRatio = (one: string, other: string) => {
  const [lighter, darker] = [luminance(one), luminance(other)].toSorted(
    (a, b) => b - a
  ) as [number, number];

  return (lighter + 0.05) / (darker + 0.05);
};

/** The OKLCH hue of a hex or `oklch(L C H)` colour, as the palette writes them. */
const hueOf = (color: string) => {
  const hex = /^#[\da-f]{6}$/iu.exec(color.trim())?.[0];

  if (hex) {
    const [, a, b] = linearToOklab(
      channelsOf(hex).map((channel) =>
        decode(channel / 255)
      ) as unknown as Triple
    );

    return Math.hypot(a, b) < 1e-6
      ? 0
      : (Math.atan2(b, a) / DEGREE + 360) % 360;
  }

  const hue = /^oklch\(\s*[\d.]+\s+[\d.]+\s+(?<hue>[\d.]+)\s*\)$/u.exec(
    color.trim()
  )?.groups?.hue;

  if (hue === undefined) {
    throw new Error(`Not a colour the tint reads: ${color}`);
  }

  return Number(hue);
};

/**
 * A surface's tone: its target, or stepped away from the frame's light or
 * dark end until the hue holds the chroma, no further than `most`.
 */
const surfaceTone = (
  [lightness, chroma]: Tone,
  hue: number,
  direction: number,
  most: number
): Tone => {
  const steps = Math.round(most / STEP);

  for (let step = 0; step <= steps; step += 1) {
    const moved = lightness + direction * step * STEP;

    if (maxChroma(moved, hue) >= chroma - 0.0005) {
      return [moved, chroma];
    }
  }

  const far = lightness + direction * most;

  return [far, Math.min(chroma, maxChroma(far, hue))];
};

/**
 * The first colour, stepping the tone's lightness away from its surfaces,
 * that `meets`; the target itself if none does.
 */
const stepped = (
  [lightness, chroma]: Tone,
  hue: number,
  direction: number,
  meets: (hex: string, moved: number) => boolean
) => {
  for (let step = 0; step <= MOST_STEPS; step += 1) {
    const moved = clamp(lightness + direction * step * STEP, 0, 1);
    const hex = hexOf(moved, chroma, hue);

    if (meets(hex, moved)) {
      return hex;
    }
  }

  return hexOf(lightness, chroma, hue);
};

/**
 * A foreground at least `ratio` against every surface it is read on,
 * darker in light and lighter in dark; at black or white it stops there.
 */
const legible = (
  tone: Tone,
  hue: number,
  direction: number,
  surfaces: readonly string[],
  ratio: number
) =>
  stepped(
    tone,
    hue,
    direction,
    (hex, moved) =>
      moved === 0 ||
      moved === 1 ||
      surfaces.every((surface) => contrastRatio(hex, surface) >= ratio)
  );

const palette = (hue: number, theme: TonalTheme): TonalTokens => {
  const tones = TONES[theme];
  const direction = theme === "light" ? -1 : 1;
  const surface = (role: Surface) => {
    const [lightness, chroma] = surfaceTone(
      tones[role],
      hue,
      direction,
      MOVE[role]
    );

    return hexOf(lightness, chroma, hue);
  };
  const shell = surface("shell");
  const muted = surface("muted");
  const secondary = surface("secondary");
  const card = surface("card");
  const popover = surface("popover");
  const accent = surface("accent");
  const border = surface("border");
  const background = surface("background");
  const text = (role: TonalRole, on: readonly string[], ratio = 4.5) =>
    legible(tones[role], hue, direction, on, ratio);
  const [labelLightness, labelChroma] = tones["primary-foreground"];
  const label = hexOf(labelLightness, labelChroma, hue);

  return {
    shell,
    muted,
    secondary,
    card,
    popover,
    accent,
    border,
    foreground: text("foreground", [shell, muted, background]),
    "muted-foreground": text("muted-foreground", [shell, card, popover]),
    "secondary-foreground": text("secondary-foreground", [secondary]),
    "accent-foreground": text("accent-foreground", [accent]),
    "card-foreground": text("card-foreground", [card]),
    "popover-foreground": text("popover-foreground", [popover]),
    // Its label at 4.5:1 on it, and the button at 3:1 against the frame and a card.
    primary: stepped(
      tones.primary,
      hue,
      direction,
      (hex) =>
        contrastRatio(label, hex) >= 4.5 &&
        contrastRatio(hex, shell) >= 3 &&
        contrastRatio(hex, card) >= 3
    ),
    "primary-foreground": label,
    ring: text(
      "ring",
      [shell, muted, secondary, card, popover, accent, background],
      3
    ),
    input: text("input", [card, popover, background], 3),
  };
};

const palettes = memoize((color: string) => {
  const hue = hueOf(color);

  return { light: palette(hue, "light"), dark: palette(hue, "dark") };
});

/**
 * The tonal palette of a profile's colour in a theme: one tone of its hue
 * for each role, surfaces first and each foreground stepped until it reads
 * on them, so contrast holds by construction.
 */
export const tonalTokens = (color: string, theme: TonalTheme): TonalTokens =>
  palettes(color)[theme];
