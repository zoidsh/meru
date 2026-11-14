import { describe, expect, it } from "vitest";

import type { Entitlement } from "../../../core/records/entitlement.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { gmail, gmailPushes } from "../../../shared/channels/gmail.ts";
import { FakeLog } from "../../../test/fakes/log.ts";
import { FakeShell } from "../../../test/fakes/shell.ts";
import { unwrap } from "../../../test/result.ts";
import { PRO, testApp } from "../../testing.ts";
import { Gmail, USER_STYLES_FILE } from "./index.ts";

const FREE: Entitlement = { expiresAt: null, kind: "free", source: "stored" };
const MAILBOX = "https://mail.google.com/mail/u/0";
const PAGE = 41;

const setup = async (given: Entitlement = PRO) => {
  let entitlement = given;
  const app = await testApp({ entitlement: () => entitlement });
  const log = new FakeLog();
  const shell = new FakeShell();
  const feature = new Gmail({
    clock: app.clock,
    commands: app.commands,
    entitlement: () => entitlement,
    events: app.events,
    fs: app.fs,
    log: log.scoped("gmail"),
    mailbox: MAILBOX,
    preload: "/dist/preload/gmail.cjs",
    profiles: app.profiles,
    registrar: app.registrar,
    settings: app.settings,
    shell,
    signIn: "https://accounts.google.com/",
    userStylesPath: `/user-data/${USER_STYLES_FILE}`,
  });
  await feature.start();
  const [tab] = app.profiles.snapshot().tabs;
  if (tab === undefined) {
    throw new Error("A first launch has a Gmail tab");
  }
  const detach = feature.page(tab).attach(PAGE);
  const request = (channel: Parameters<typeof wireName>[0], payload = {}) =>
    app.registrar.dispatch(PAGE, wireName(channel), payload);
  const pushed = (channel: Parameters<typeof wireName>[0]) =>
    app.transport.sent
      .filter((sent) => sent.channel === wireName(channel))
      .map((sent) => sent.payload);
  const entitle = (next: Entitlement) => {
    entitlement = next;
    app.events.emit("entitlement.changed", { entitlement: next });
  };
  return { app, detach, entitle, feature, log, pushed, request, shell, tab };
};

describe(Gmail, () => {
  it("gives a Gmail page its preload on the Gmail surface", async () => {
    const { feature, tab } = await setup();
    expect(feature.page(tab)).toMatchObject({
      arguments: ["--meru-surface=gmail"],
      preload: "/dist/preload/gmail.cjs",
    });
  });

  it("answers the first read with the settings and pushes each change under a new version", async () => {
    const { app, pushed, request } = await setup();
    const first = unwrap(request(gmail.settings));
    expect(first).toMatchObject({
      mailbox: MAILBOX,
      styles: { hideGmailLogo: true, reverseConversation: false },
      version: 0,
    });
    unwrap(app.settings.set("gmail.reverseConversation", true));
    expect(pushed(gmailPushes.settingsChanged)).toMatchObject([
      { styles: { reverseConversation: true }, version: 1 },
    ]);
    unwrap(app.settings.set("stage.zoom", 1.1));
    expect(pushed(gmailPushes.settingsChanged)).toHaveLength(1);
  });

  it("carries the user's styles while Pro allows them, and follows the file", async () => {
    const { app, entitle, pushed, request } = await setup();
    app.fs.edit(USER_STYLES_FILE, "a { color: red }");
    await expect
      .poll(() => pushed(gmailPushes.settingsChanged).at(-1))
      .toMatchObject({ userStyles: "a { color: red }" });
    entitle(FREE);
    expect(pushed(gmailPushes.settingsChanged).at(-1)).toMatchObject({
      userStyles: "",
    });
    expect(unwrap(request(gmail.settings))).toMatchObject({ userStyles: "" });
  });

  it("marks the sender's profile as needing to sign in, whatever profile the payload names", async () => {
    const { app, request, tab } = await setup();
    unwrap(request(gmail.needsSignIn, { profileId: "someone-else" }));
    expect(app.profiles.snapshot().profiles[0]).toMatchObject({
      id: tab.profileId,
      status: { kind: "needsSignIn" },
    });
  });

  it("writes a warning for each selector a page reports missing", async () => {
    const { log, request } = await setup();
    unwrap(request(gmail.selectorMiss, { selector: "conversation" }));
    expect(log.at("warn")).toStrictEqual(["A Gmail selector found nothing"]);
  });

  it("takes a tab's page to a mailbox address by its fragment, and leaves any other to the caller", async () => {
    const { detach, feature, pushed, tab } = await setup();
    expect(feature.navigate(tab.id, `${MAILBOX}/#inbox/FMfcg`)).toBeTruthy();
    expect(pushed(gmailPushes.navigate)).toStrictEqual([
      { hash: "#inbox/FMfcg" },
    ]);
    expect(feature.navigate(tab.id, "https://example.com/#inbox")).toBeFalsy();
    expect(feature.navigate(tab.id, `${MAILBOX}/`)).toBeFalsy();
    detach();
    expect(feature.navigate(tab.id, `${MAILBOX}/#inbox/FMfcg`)).toBeFalsy();
  });

  it("refuses a page's request once its view is gone", async () => {
    const { detach, request } = await setup();
    detach();
    expect(request(gmail.settings)).toMatchObject({
      error: { kind: "wrongSurface" },
    });
  });

  it("makes the user styles file before opening it, only while Pro allows it", async () => {
    const { app, entitle, shell } = await setup();
    unwrap(app.commands.run("gmail.editUserStyles", { windowId: 1 }));
    await expect
      .poll(() => shell.files)
      .toStrictEqual([`/user-data/${USER_STYLES_FILE}`]);
    expect(app.fs.files.get(USER_STYLES_FILE)).toBe("");
    unwrap(app.commands.run("gmail.revealUserStyles", { windowId: 1 }));
    await expect.poll(() => shell.revealed).toHaveLength(1);
    entitle(FREE);
    expect(app.commands.enabled("gmail.editUserStyles")).toBeFalsy();
  });
});
