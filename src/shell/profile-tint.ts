import { useLayoutEffect } from "react";

import { TONAL_ROLES, tonalTokens } from "#core/tonal-tint.ts";

import { useShellState } from "./sync.ts";

/**
 * The colour a profile's documents are tinted with: the selected profile's
 * without `profileId`; none while Tint with profile color is off.
 */
export const useTintColor = (profileId?: string) => {
  const profiles = useShellState("profiles");
  const tinted = useShellState("appearance")?.tint ?? true;
  const id = profileId ?? profiles?.selectedProfileId;

  return tinted
    ? profiles?.profiles.find((profile) => profile.id === id)?.color
    : undefined;
};

/**
 * Gives `target`'s root the tonal palette of `color` as shadcn's tokens, or
 * takes it away for none. Each is `light-dark()` of the two themes, so the
 * theme `:root`'s `color-scheme` follows picks it, a change of theme
 * repainting with no render. Set before the commit paints, so a document is
 * never drawn grey first.
 */
export const useProfileTint = (
  target: Document | undefined,
  color: string | undefined
) => {
  useLayoutEffect(() => {
    const root = target?.documentElement;

    if (!root) {
      return;
    }

    if (color === undefined) {
      // A document opened from the shell's copies its root's attributes.
      root.toggleAttribute("data-tint", false);

      return;
    }

    const light = tonalTokens(color, "light");
    const dark = tonalTokens(color, "dark");

    for (const role of TONAL_ROLES) {
      root.style.setProperty(
        `--${role}`,
        `light-dark(${light[role]}, ${dark[role]})`
      );
    }

    root.toggleAttribute("data-tint", true);

    return () => {
      for (const role of TONAL_ROLES) {
        root.style.removeProperty(`--${role}`);
      }

      root.toggleAttribute("data-tint", false);
    };
  }, [target, color]);
};
