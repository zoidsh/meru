import { describe, expect, it } from "vitest";

import {
  GMAIL_FEATURES_SCHEMA,
  GMAIL_HEALTH_SCHEMA,
  isGmailFeatures,
} from "./gmail.ts";

const FEATURES = {
  hideInboxFooter: false,
  hidePromoBanner: true,
  hideUpgradeButton: false,
  reverseConversation: false,
  moveAttachmentsToTop: false,
  showTrimmedContent: true,
  extendDarkTheme: true,
};

describe(isGmailFeatures, () => {
  it("agrees with main's schema on what a features message is", () => {
    const samples: unknown[] = [
      FEATURES,
      { ...FEATURES, hideInboxFooter: "yes" },
      { ...FEATURES, extra: true },
      { hideInboxFooter: true },
      [],
      null,
      undefined,
      "features",
      1,
    ];

    for (const sample of samples) {
      expect(isGmailFeatures(sample)).toBe(
        GMAIL_FEATURES_SCHEMA.safeParse(sample).success
      );
    }

    expect(isGmailFeatures(FEATURES)).toBeTruthy();
  });
});

describe("the health report's schema", () => {
  const health = {
    views: ["list", "thread"],
    hooks: {
      footer: "broken",
      promo: "absent",
      upgrade: "matched",
      conversation: "matched",
      attachments: "absent",
      trimmed: "absent",
      trimmedToggle: "absent",
      refresh: "matched",
      darkPane: "absent",
      darkPaneText: "absent",
      darkCompose: "absent",
      darkComposeText: "absent",
      darkComposePaint: "absent",
      editorCard: "absent",
      bodyCard: "absent",
      darkMenu: "absent",
      darkMenuText: "absent",
      darkMenuPaint: "absent",
      darkDialog: "absent",
      darkDialogText: "absent",
      sentNotice: "absent",
    },
    ms: 2,
  };

  it("takes a report of every hook by a view the registry knows", () => {
    expect(GMAIL_HEALTH_SCHEMA.safeParse(health).success).toBeTruthy();
  });

  it("refuses a hook it does not know, a missing one, an unknown status or view, and anything more", () => {
    for (const sample of [
      { ...health, hooks: { ...health.hooks, sender: "matched" } },
      { ...health, hooks: { footer: "broken" } },
      { ...health, hooks: { ...health.hooks, footer: "fine" } },
      { ...health, views: ["inbox"] },
      { ...health, address: "someone@example.com" },
      { ...health, ms: -1 },
      { ...health, ms: Number.POSITIVE_INFINITY },
    ]) {
      expect(GMAIL_HEALTH_SCHEMA.safeParse(sample).success).toBeFalsy();
    }
  });
});
