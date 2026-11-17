import type { State } from "./state.ts";

/** The design's eight profile colours, in its order, for light and dark alike. */
export const PROFILE_COLORS = [
  "#2d52d2",
  "#ff6227",
  "oklch(0.72 0.19 150)",
  "oklch(0.65 0.2 330)",
  "oklch(0.7 0.13 200)",
  "oklch(0.7 0.17 125)",
  "oklch(0.74 0.15 80)",
  "oklch(0.58 0.2 285)",
] as const;

/**
 * A profile's colour, as CSS. Nothing is stored yet, so it follows the
 * profile's place in the row, round the palette again after the eighth.
 */
export const profileColor = (
  state: Pick<State, "profiles">,
  profileId: string
) => {
  const index = Math.max(
    0,
    state.profiles.findIndex((profile) => profile.id === profileId)
  );

  return PROFILE_COLORS[index % PROFILE_COLORS.length] ?? PROFILE_COLORS[0];
};
