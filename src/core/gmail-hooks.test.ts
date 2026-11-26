import { describe, expect, it } from "vitest";

import {
  FEATURE_RULES,
  GMAIL_FEATURES,
  HOOKS,
  HOOK_GUARD,
  HOOK_NAMES,
  VIEW_ANCHORS,
  decideHook,
  detectViews,
  featureStylesheet,
  findHook,
  gmailFeatures,
  guardedSelector,
  witnessSelector,
} from "./gmail-hooks.ts";
import { SETTINGS } from "./settings.ts";

/** Every selector the page is read by, as the rules and the check use it. */
const everySelector = [
  ...HOOKS.flatMap((hook) => [
    ...hook.anchors.map((anchor) => guardedSelector(hook, anchor)),
    ...(hook.witness === undefined
      ? []
      : [witnessSelector(hook, hook.witness)]),
  ]),
  ...Object.values(VIEW_ANCHORS),
];

describe("the registry", () => {
  it("names each hook once, and every feature's rules name hooks it holds", () => {
    expect(HOOKS.map((hook) => hook.name)).toStrictEqual([...HOOK_NAMES]);

    for (const feature of GMAIL_FEATURES) {
      expect(FEATURE_RULES[feature].length).toBeGreaterThan(0);

      for (const { hook, only = [] } of FEATURE_RULES[feature]) {
        expect(findHook(hook).name).toBe(hook);

        for (const anchor of only) {
          expect(findHook(hook).anchors).toContain(anchor);
        }
      }
    }
  });

  it("reads nothing Gmail translates", () => {
    for (const selector of everySelector) {
      expect(selector).not.toMatch(
        /aria-label|aria-description|aria-roledescription|aria-valuetext|data-tooltip|data-name|\[title|\balt\b|placeholder|:contains/u
      );
    }
  });

  it("makes each anchor one selector, so the guard applies to all of it", () => {
    for (const hook of HOOKS) {
      for (const anchor of hook.anchors) {
        // A comma inside :has(...) is part of one selector; one outside it
        // would start a second.
        expect(anchor.replaceAll(/\([^()]*\)/gu, "()")).not.toContain(",");
      }
    }
  });

  it("switches each feature by a boolean setting, each off until the person turns it on", () => {
    expect(
      Object.fromEntries(
        GMAIL_FEATURES.map((feature) => [feature, SETTINGS[feature].default])
      )
    ).toStrictEqual({
      hideInboxFooter: false,
      hidePromoBanner: false,
      hideUpgradeButton: false,
      reverseConversation: false,
      moveAttachmentsToTop: false,
      showTrimmedContent: false,
      extendDarkTheme: false,
    });
  });
});

describe(gmailFeatures, () => {
  it("is each setting, one for one", () => {
    expect(
      gmailFeatures((feature) => feature !== "hidePromoBanner")
    ).toStrictEqual({
      hideInboxFooter: true,
      hidePromoBanner: false,
      hideUpgradeButton: true,
      reverseConversation: true,
      moveAttachmentsToTop: true,
      showTrimmedContent: true,
      extendDarkTheme: true,
    });
  });
});

/** The hides' stylesheets as they ship, which nothing may change. */
const SHIPPED_HIDES = {
  hideInboxFooter:
    '[role="contentinfo"]:has(a[href*="/gmail/about/policy/"]):not([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable], :has([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable]), [data-message-id] *, [data-compose-id] *, [contenteditable] *) { display: none !important; }\n.apa .apO:has(a[href*="/gmail/about/policy/"]):not([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable], :has([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable]), [data-message-id] *, [data-compose-id] *, [contenteditable] *) { display: none !important; }\n.apa .apc:has(a[href*="/settings/storage"]):not([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable], :has([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable]), [data-message-id] *, [data-compose-id] *, [contenteditable] *) { display: none !important; }',
  hidePromoBanner:
    '[role="main"] [data-rp-onramp-container]:not([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable], :has([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable]), [data-message-id] *, [data-compose-id] *, [contenteditable] *) { display: none !important; }',
  hideUpgradeButton:
    '[data-pep-id="global-pep-gmail"]:not([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable], :has([gh="tl"], [data-legacy-thread-id], [data-message-id], [data-compose-id], [role="main"], [role="navigation"], input, textarea, [contenteditable]), [data-message-id] *, [data-compose-id] *, [contenteditable] *) { display: none !important; }',
};

describe(featureStylesheet, () => {
  it("leaves each hide's stylesheet as shipped, byte for byte", () => {
    for (const [feature, stylesheet] of Object.entries(SHIPPED_HIDES)) {
      expect(featureStylesheet(feature as keyof typeof SHIPPED_HIDES)).toBe(
        stylesheet
      );
    }
  });

  it("is one rule per anchor of each rule's hook, its guarded match where it targets nothing else", () => {
    for (const feature of GMAIL_FEATURES) {
      const expected = FEATURE_RULES[feature].flatMap(
        ({ hook, only, target, declarations }) =>
          (only ?? findHook(hook).anchors).map((anchor) =>
            target
              ? undefined
              : `${guardedSelector(findHook(hook), anchor)} { ${declarations} }`
          )
      );
      const rules = featureStylesheet(feature).split("\n");

      expect(rules).toHaveLength(expected.length);

      expect(
        rules.filter((_rule, index) => expected[index] !== undefined)
      ).toStrictEqual(expected.filter((rule) => rule !== undefined));
    }
  });

  it("guards every hide with the shipped guard", () => {
    expect(guardedSelector(findHook("upgrade"), "x")).toBe(`x${HOOK_GUARD}`);
  });
});
describe(decideHook, () => {
  const refresh = findHook("refresh");
  const footer = findHook("footer");
  const promo = findHook("promo");

  it("is matched when an anchor matches and no witness shows outside it", () => {
    expect(decideHook(refresh, ["list"], true, "none")).toBe("matched");
    expect(decideHook(footer, ["list"], true, "covered")).toBe("matched");
  });

  it("is broken when the witness shows outside every match, matched or not", () => {
    expect(decideHook(footer, ["list"], true, "uncovered")).toBe("broken");
    expect(decideHook(footer, ["list"], false, "uncovered")).toBe("broken");
  });

  it("is broken when nothing matches in a view that always has it", () => {
    expect(decideHook(refresh, ["list", "thread"], false, "none")).toBe(
      "broken"
    );
  });

  it("is only absent where nothing says it should be there", () => {
    expect(decideHook(refresh, [], false, "none")).toBe("absent");
    expect(decideHook(refresh, ["thread"], false, "none")).toBe("absent");
    expect(decideHook(footer, ["list"], false, "none")).toBe("absent");
    expect(decideHook(promo, ["list"], false, "none")).toBe("absent");
  });
});

describe(detectViews, () => {
  it("lists every view the anchors found, and settings by the hash", () => {
    expect(
      detectViews({ list: true, thread: true, compose: false }, "#inbox/abc")
    ).toStrictEqual(["list", "thread"]);
    expect(
      detectViews(
        { list: false, thread: false, compose: true },
        "#settings/general"
      )
    ).toStrictEqual(["compose", "settings"]);
    expect(
      detectViews({ list: false, thread: false, compose: false }, "")
    ).toStrictEqual([]);
  });
});
