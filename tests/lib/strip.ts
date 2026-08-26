/*
 * The vertical tab strip, waited for rather than assumed.
 *
 * Anything asserted about what the strip does or does not contain has to happen
 * after it has rendered with the config in hand. Asserting an absence before
 * that is the trap: `toHaveCount(0)` is satisfied the instant it finds nothing,
 * so it passes against a strip that has not been drawn yet — and reports the
 * app as gating something it is in fact showing.
 */
import { expect } from "@playwright/test";
import type { MeruApp } from "./app";

/**
 * Resolves once `VerticalTabs` has rendered.
 *
 * The width toggle is the signal because that component draws it and nothing
 * else does. The bookmarks button beside the launcher looks like the closer
 * anchor and is not usable: the titlebar renders one too, and it arrives before
 * the strip, so waiting on it lets an assertion run a commit early.
 */
export async function waitForVerticalTabs(meru: MeruApp) {
  await expect(meru.renderer.getByRole("button", { name: "Widen the tab strip" })).toBeVisible();
}
