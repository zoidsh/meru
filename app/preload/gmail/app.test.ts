import { describe, expect, it } from "vitest";

import { gmail } from "../../shared/channels/gmail.ts";
import { gmailSurface } from "../../shared/channels/surfaces.ts";
import { FakeContentBridge } from "../content/fake-bridge.ts";
import { startGmail } from "./app.ts";
import { hideGmailLogo } from "./features/hide-gmail-logo.ts";
import { needsSignIn } from "./features/needs-sign-in.ts";
import { mountGmail, stylesWith, testSettings } from "./testing.ts";

describe(startGmail, () => {
  it("says which settings it applied, every time they change", () => {
    const page = mountGmail({ features: [hideGmailLogo] });

    page.change({});
    page.change({});

    expect(page.bridge.sentOn(gmail.settingsAck)).toStrictEqual([
      { version: 1 },
      { version: 2 },
      { version: 2 },
    ]);
    page.app.dispose();
  });

  it("holds a feature of the mailbox back while the page is elsewhere", () => {
    const page = mountGmail({
      features: [hideGmailLogo, needsSignIn],
      href: `${testSettings.signIn}/v3/signin/identifier`,
      settings: { styles: stylesWith("hideGmailLogo") },
    });

    expect(page.sheet("hideGmailLogo")).toBeUndefined();
    expect(page.bridge.sentOn(gmail.needsSignIn)).toStrictEqual([{}]);

    page.go(`${testSettings.mailbox}/#inbox`);
    page.change({});

    expect(page.sheet("hideGmailLogo")).toContain("display: none");
    page.app.dispose();
  });

  it("applies nothing while main has no settings to give", () => {
    const bridge = new FakeContentBridge(gmailSurface);
    document.head.innerHTML = "";

    const app = startGmail({
      bridge,
      document,
      features: [hideGmailLogo],
      location: { href: () => testSettings.mailbox, setHash: () => {} },
    });

    expect(document.head.innerHTML).toBe("");
    expect(bridge.sentOn(gmail.settingsAck)).toStrictEqual([]);
    app.dispose();
  });

  it("takes every sheet down when the page goes", () => {
    const page = mountGmail({
      features: [hideGmailLogo],
      settings: { styles: stylesWith("hideGmailLogo") },
    });

    page.app.dispose();

    expect(page.sheet("hideGmailLogo")).toBeUndefined();
  });
});
