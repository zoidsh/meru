import { describe, expect, it } from "vitest";

import {
  GMAIL_FEATURES,
  HIDES,
  HOOKS,
  HOOK_GUARD,
  HOOK_NAMES,
  VIEW_ANCHORS,
  decideHook,
  detectViews,
  findHook,
  gmailFeatures,
  hideStylesheet,
} from "./gmail-hooks.ts";
import { SETTINGS } from "./settings.ts";

const anchorsAndWitnesses = [
  ...HOOKS.flatMap((hook) => [...hook.anchors, hook.witness ?? ""]),
  ...Object.values(VIEW_ANCHORS),
];

describe("the registry", () => {
  it("names each hook once, and every hide names hooks it holds", () => {
    expect(HOOKS.map((hook) => hook.name)).toStrictEqual([...HOOK_NAMES]);

    for (const feature of GMAIL_FEATURES) {
      expect(HIDES[feature].length).toBeGreaterThan(0);

      for (const name of HIDES[feature]) {
        expect(findHook(name).name).toBe(name);
      }
    }
  });

  it("reads nothing Gmail translates", () => {
    for (const selector of anchorsAndWitnesses) {
      expect(selector).not.toMatch(
        /aria-label|data-tooltip|\[title|\balt\b|placeholder|:contains/u
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

  it("switches each feature by a boolean setting that is on by default, as in v3", () => {
    for (const feature of GMAIL_FEATURES) {
      expect(SETTINGS[feature].default).toBeTruthy();
    }
  });
});

describe(gmailFeatures, () => {
  it("is each setting, one for one", () => {
    expect(
      gmailFeatures((feature) => feature !== "hidePromoBanner")
    ).toStrictEqual({
      hideGmailLogo: true,
      hideInboxFooter: true,
      hidePromoBanner: false,
      hideUpgradeButton: true,
    });
  });
});

describe(hideStylesheet, () => {
  it("is one guarded rule per anchor of the hide's hooks", () => {
    const rules = hideStylesheet("hideInboxFooter").split("\n");

    expect(rules).toHaveLength(findHook("footer").anchors.length);

    for (const [index, anchor] of findHook("footer").anchors.entries()) {
      expect(rules[index]).toBe(
        `${anchor}${HOOK_GUARD} { display: none !important; }`
      );
    }
  });
});

describe(decideHook, () => {
  const logo = findHook("logo");
  const footer = findHook("footer");
  const promo = findHook("promo");

  it("is matched when an anchor matches and no witness shows outside it", () => {
    expect(decideHook(logo, ["list"], true, "none")).toBe("matched");
    expect(decideHook(footer, ["list"], true, "covered")).toBe("matched");
  });

  it("is broken when the witness shows outside every match, matched or not", () => {
    expect(decideHook(footer, ["list"], true, "uncovered")).toBe("broken");
    expect(decideHook(footer, ["list"], false, "uncovered")).toBe("broken");
  });

  it("is broken when nothing matches in a view that always has it", () => {
    expect(decideHook(logo, ["thread"], false, "none")).toBe("broken");
  });

  it("is only absent where nothing says it should be there", () => {
    expect(decideHook(logo, [], false, "none")).toBe("absent");
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
