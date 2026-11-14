import { describe, expect, it } from "vitest";

import { gmail, gmailPushes } from "../../shared/channels/gmail.ts";
import { gmailSurface } from "../../shared/channels/surfaces.ts";
import { unwrap } from "../../test/result.ts";
import { FakeContentBridge } from "./fake-bridge.ts";
import { contentAllowlist } from "./surface-allowlist.ts";

const settings = {
  labelColors: [],
  mailbox: "https://mail.google.com/mail/u/0",
  signIn: "https://accounts.google.com",
  styles: {
    hideGmailLogo: false,
    hidePromoBanner: false,
    hideUpgradeButton: false,
    reverseConversation: false,
    showTrimmedContent: false,
  },
  userStyles: "",
  version: 1,
};

describe(contentAllowlist, () => {
  it("allows the named surface's channels and nothing without the argument", () => {
    const named = contentAllowlist(["--meru-surface=gmail"], "gmail");
    expect(named.sync.has("gmail.settings")).toBeTruthy();
    expect(named.push.has("gmail.settingsChanged")).toBeTruthy();

    const unnamed = contentAllowlist(["--meru-surface=google"], "gmail");
    expect(unnamed.sync.size).toBe(0);
    expect(unnamed.push.size).toBe(0);
    expect(unnamed.event.size).toBe(0);
  });
});

describe(FakeContentBridge, () => {
  it("reads the settings main answers with and hears a push", () => {
    const bridge = new FakeContentBridge(gmailSurface);
    bridge.answer(gmail.settings, settings);

    expect(unwrap(bridge.sendSync(gmail.settings, {})).version).toBe(1);

    const seen: number[] = [];
    const unsubscribe = bridge.on(gmailPushes.settingsChanged, (next) => {
      seen.push(next.version);
    });
    bridge.push(gmailPushes.settingsChanged, { ...settings, version: 2 });
    unsubscribe();
    bridge.push(gmailPushes.settingsChanged, { ...settings, version: 3 });

    expect(seen).toStrictEqual([2]);
    bridge.send(gmail.settingsAck, { version: 2 });
    expect(bridge.sentOn(gmail.settingsAck)).toStrictEqual([{ version: 2 }]);
  });

  it("drops a push whose payload does not parse", () => {
    const bridge = new FakeContentBridge(gmailSurface);
    const seen: string[] = [];
    bridge.on(gmailPushes.navigate, ({ hash }) => {
      seen.push(hash);
    });

    bridge.push(gmailPushes.navigate, { hash: "no-hash" });

    expect(seen).toStrictEqual([]);
  });

  it("refuses every channel when the command line named no surface", () => {
    const bridge = new FakeContentBridge(
      gmailSurface,
      contentAllowlist([], "gmail")
    );

    expect(() => bridge.sendSync(gmail.settings, {})).toThrow(
      "gmail.settings is not a channel this page may use"
    );
    expect(() => {
      bridge.send(gmail.needsSignIn, {});
    }).toThrow("gmail.needsSignIn");
    expect(() =>
      bridge.on(gmailPushes.navigate, () => {
        // nothing
      })
    ).toThrow("gmail.navigate");
  });
});
