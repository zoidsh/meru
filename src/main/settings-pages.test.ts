import { describe, expect, it } from "vitest";

import { createSettingsPages } from "./settings-pages.ts";

const ABOUT = { section: "about", profileId: null } as const;

describe(createSettingsPages, () => {
  it("tells the window of a page opened again while it shows, so it starts again from its top", () => {
    const pages = createSettingsPages();
    let told = 0;

    pages.onChange(() => {
      told += 1;
    });
    pages.open(ABOUT);
    pages.open(ABOUT);

    expect(pages.current()).toStrictEqual(ABOUT);
    expect(pages.opened()).toBe(2);
    expect(told).toBe(2);
  });

  it("counts no opening for a step, so the page stepped to keeps its place", () => {
    const pages = createSettingsPages();

    pages.open(ABOUT);
    pages.step(-1);

    expect(pages.canGoForward()).toBeTruthy();
    expect(pages.opened()).toBe(1);
  });
});
