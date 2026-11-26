import type { Profile, State } from "./state.ts";

/** The design's eight profile colours by name, in its order, for light and dark alike. */
const PALETTE = {
  blue: "#2d52d2",
  orange: "#ff6227",
  green: "oklch(0.72 0.19 150)",
  pink: "oklch(0.65 0.2 330)",
  cyan: "oklch(0.7 0.13 200)",
  lime: "oklch(0.7 0.17 125)",
  amber: "oklch(0.74 0.15 80)",
  violet: "oklch(0.58 0.2 285)",
} as const;

export type ProfileColorName = keyof typeof PALETTE;

/**
 * How much of the profile's colour the shell takes, weakest first; the
 * percentages, which differ by theme, are `styles.css`'s.
 */
export const PROFILE_TINT_STRENGTHS = ["low", "medium", "high"] as const;

export type ProfileTintStrength = (typeof PROFILE_TINT_STRENGTHS)[number];

export const PROFILE_COLOR_NAMES = Object.keys(PALETTE) as [
  ProfileColorName,
  ...ProfileColorName[],
];

export const PROFILE_COLORS = PROFILE_COLOR_NAMES.map((name) => PALETTE[name]);

export const isProfileColorName = (value: unknown): value is ProfileColorName =>
  typeof value === "string" && Object.hasOwn(PALETTE, value);

/** The colour at a place in the row, round the palette again after the eighth. */
const colorAt = (index: number): ProfileColorName =>
  PROFILE_COLOR_NAMES[index % PROFILE_COLOR_NAMES.length] ??
  PROFILE_COLOR_NAMES[0];

/**
 * A profile's colour by name: the one stored, else the one at its place in
 * the row, as before colours were stored; the first for one not listed.
 */
export const profileColorName = (
  state: Pick<State, "profiles">,
  profileId: string
): ProfileColorName => {
  const index = state.profiles.findIndex((profile) => profile.id === profileId);
  const stored = state.profiles[index]?.color;

  return isProfileColorName(stored) ? stored : colorAt(Math.max(0, index));
};

/** A colour of the palette, as CSS. */
export const paletteColor = (name: ProfileColorName) => PALETTE[name];

/** A profile's colour, as CSS. */
export const profileColor = (
  state: Pick<State, "profiles">,
  profileId: string
) => paletteColor(profileColorName(state, profileId));

/**
 * The colour a profile added now takes: the first no listed profile has,
 * else the one at the new profile's place.
 */
export const firstUnusedColor = (
  state: Pick<State, "profiles">
): ProfileColorName => {
  const used = new Set(
    state.profiles.map((profile) => profileColorName(state, profile.id))
  );

  return (
    PROFILE_COLOR_NAMES.find((name) => !used.has(name)) ??
    colorAt(state.profiles.length)
  );
};

/**
 * The profiles with the colour of each from place `from` on stored, so a
 * change of their places changes no colour that came from a place. A stored
 * value this build cannot read is left as found, since `state.json` keeps
 * what it does not understand; that profile follows its new place here.
 */
export const withColorsStored = (
  state: Pick<State, "profiles">,
  from = 0
): Profile[] =>
  state.profiles.map((profile, index) =>
    index < from || profile.color !== undefined
      ? profile
      : { ...profile, color: profileColorName(state, profile.id) }
  );
