/// <reference lib="dom" />
// The repository compiles without the DOM library, and these cases read the
// renderer's own layout back out of it.

/*
 * The trial badge in the titlebar trades its text for "Upgrade to Meru Pro"
 * while hovered. The badge clips whatever runs past it, so it has to be as wide
 * as the longer of its two texts, which "Pro trial ended" is not, and stay that
 * wide either way, or it jumps under the pointer.
 */
import { expect, test } from "@playwright/test";
import { type MeruApp, useApp } from "./lib/app";

const EXPIRED = { daysLeft: 0, expired: true };

/*
 * Pushed the way main pushes a change found by its periodic check, which is
 * what draws the badge without a trial the API would have to grant.
 */
function setTrialState(meru: MeruApp, state: typeof EXPIRED) {
  return meru.app.evaluate(({ BrowserWindow }, trial) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes("main.html"),
    );

    window?.webContents.send("trial.changed", trial);
  }, state);
}

/**
 * The badge's padding box, and the box of each run of text in it, once any
 * fade between its two sides has finished.
 */
function readBadgeLayout(meru: MeruApp) {
  return meru.renderer.evaluate(async () => {
    await document.fonts.ready;

    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );

    const badge = document.querySelector('a[href$="#pricing"]')?.closest('[data-slot="badge"]');

    if (!badge) {
      throw new Error("The titlebar is not showing the trial badge");
    }

    const badgeBox = badge.getBoundingClientRect();

    const { borderLeftWidth, borderRightWidth } = getComputedStyle(badge);

    const range = document.createRange();

    const walker = document.createTreeWalker(badge, NodeFilter.SHOW_TEXT);

    const texts: { text: string; left: number; right: number }[] = [];

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();

      if (!text) {
        continue;
      }

      range.selectNodeContents(node);

      const box = range.getBoundingClientRect();

      texts.push({ text, left: box.left, right: box.right });
    }

    return {
      left: badgeBox.left + Number.parseFloat(borderLeftWidth),
      right: badgeBox.right - Number.parseFloat(borderRightWidth),
      width: badgeBox.width,
      texts,
    };
  });
}

/** Every text that reaches more than a pixel past the badge's padding box. */
function findClippedTexts(layout: Awaited<ReturnType<typeof readBadgeLayout>>) {
  return layout.texts
    .filter((text) => text.left < layout.left - 1 || text.right > layout.right + 1)
    .map(
      (text) =>
        `"${text.text}" runs ${Math.round(Math.max(layout.left - text.left, text.right - layout.right))}px past the badge`,
    );
}

test.describe("the trial badge", () => {
  const meru = useApp();

  test("fits both its texts once the trial has ended, and keeps its width on hover", async () => {
    await setTrialState(meru, EXPIRED);

    const trialBadge = meru.renderer.locator('a[href$="#pricing"]');

    await expect(trialBadge).toHaveText(/Pro trial ended/);

    const resting = await readBadgeLayout(meru);

    await trialBadge.hover();

    const hovered = await readBadgeLayout(meru);

    expect(
      hovered.texts.map((text) => text.text),
      "the badge's two texts",
    ).toEqual(["Pro trial ended", "Upgrade to Meru Pro"]);

    expect(findClippedTexts(hovered), "text clipped by the hovered badge").toEqual([]);

    expect(hovered.width, "the badge's width once hovered").toBeCloseTo(resting.width, 0);
  });
});
