import { describe, expect, test } from "bun:test";
import { resolveViewFocusTarget, type ViewFocusTarget } from "./view-focus";

const base = {
  location: "/",
  activeTab: { isWindowed: false, hasView: true },
  hasGmailView: true,
};

describe("resolveViewFocusTarget", () => {
  const cases: Array<[string, Partial<typeof base>, ViewFocusTarget]> = [
    ["the active tab is in front", {}, "activeTab"],
    ["settings is open", { location: "/settings/general" }, null],
    ["the unified inbox is open", { location: "/unified-inbox" }, null],
    ["the download history is open", { location: "/download-history" }, null],
    [
      "the active tab is detached into its own window",
      { activeTab: { isWindowed: true, hasView: true } },
      null,
    ],
    [
      "a dormant tab is still materializing",
      { activeTab: { isWindowed: false, hasView: false } },
      "gmail",
    ],
    [
      "no view exists yet, before the account's views are created",
      { activeTab: { isWindowed: false, hasView: false }, hasGmailView: false },
      null,
    ],
    [
      "a route is open and the active tab is windowed",
      { location: "/settings/general", activeTab: { isWindowed: true, hasView: true } },
      null,
    ],
  ];

  for (const [name, overrides, expected] of cases) {
    test(name, () => {
      expect(resolveViewFocusTarget({ ...base, ...overrides })).toBe(expected);
    });
  }
});
