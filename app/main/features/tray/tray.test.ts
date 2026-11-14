import { setImmediate } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { INBOX_FEED_URL } from "../../../core/engines/inbox.ts";
import { AppEvents } from "../../../core/events.ts";
import { NONE_UNREAD, TWO_UNREAD } from "../../../core/fixtures/gmail-feeds.ts";
import { themeOf } from "../../../core/ports.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import type { Platform } from "../../../core/records/platform.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { strictLog } from "../../../test/fakes/log.ts";
import { FakeOnline } from "../../../test/fakes/online.ts";
import { FakePower } from "../../../test/fakes/power.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeTheme } from "../../../test/fakes/theme.ts";
import { FakeTray } from "../../../test/fakes/tray.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { MainWindow } from "../../shell/window.ts";
import { Inbox } from "../inbox/index.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Tray } from "./index.ts";

const PRO: Entitlement = {
  deviceLimit: 3,
  expiresAt: null,
  kind: "licensed",
  plan: "pro",
  seat: null,
  source: "stored",
};

const feed = (text: string) => ({ status: 200, text, url: INBOX_FEED_URL });

const setup = async (platform: Platform) => {
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ log: strictLog, transport });
  registrar.assign(3, chromeSurface);
  const lifecycle = new FakeLifecycle(platform);
  const clock = new FakeClock(Date.parse("2026-11-13T09:00:00Z"));
  const events = new AppEvents();
  const settings = new SettingsStore({
    entitlement: () => PRO,
    events,
    lifecycle,
    clock,
    fs: new FakeFs(),
    log: strictLog,
    registrar,
    watchFile: false,
  });
  const profiles = new Profiles({
    commands: new CommandDispatcher(),
    lifecycle,
    clock,
    entitlement: PRO,
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    log: strictLog,
    registrar,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  profiles.start();
  const personal = profiles.selected().id;
  const created = profiles.createProfile("Work");
  const work = created.ok ? created.value.id : "";
  const sessions = new FakeSessions();
  sessions.answer(INBOX_FEED_URL, feed(NONE_UNREAD), partitionOf(personal));
  sessions.answer(INBOX_FEED_URL, feed(TWO_UNREAD), partitionOf(work));
  const inbox = new Inbox({
    clock,
    events,
    feedUrl: INBOX_FEED_URL,
    log: strictLog,
    online: new FakeOnline(),
    power: new FakePower(),
    profiles,
    sessions,
    settings,
  });
  const theme = new FakeTheme();
  const window = new MainWindow({
    background: false,
    bounds: { height: 800, width: 1200, x: 0, y: 0 },
    linuxControls: false,
    onCreated: () => {
      // Nothing to attach to a window no stage draws in.
    },
    pages: {
      devServer: undefined,
      dir: "/dist",
      platform,
      theme: () => themeOf(theme),
    },
    ports: {
      lifecycle,
      theme,
      windows: { create: () => new FakeWindow() },
    },
    preload: "/preload.cjs",
    registrar,
    surface: "chrome",
  });
  await window.show();
  const port = new FakeTray(platform);
  new Tray({
    events,
    inbox,
    platform,
    profiles,
    settings,
    theme,
    tray: port,
    window,
  }).start();
  inbox.start();
  await setImmediate();
  return { personal, port, profiles, settings, theme, window, work };
};

describe(Tray, () => {
  it("lists each profile with its unread count, then hiding the window and quitting in the platform's words", async () => {
    const { port } = await setup("win32");
    expect({
      icon: port.spec?.icon,
      menu: port.spec?.menu.map((item) =>
        item.kind === "separator" ? "-" : item.label
      ),
      title: port.spec?.title,
    }).toStrictEqual({
      icon: { kind: "tray", shade: "dark", unread: true },
      menu: ["Personal", "Work (2)", "-", "Hide Meru", "-", "Exit"],
      title: "",
    });
  });

  it("puts nothing in macOS's menu bar until asked, and then the template icon with the count beside it", async () => {
    const { port, settings } = await setup("darwin");
    const before = port.spec;
    settings.set("tray.icon", true);
    expect([before, port.spec?.icon, port.spec?.title]).toStrictEqual([
      undefined,
      { kind: "template" },
      "2",
    ]);
  });

  it("follows the theme with a system-coloured icon, and keeps a chosen colour whatever the theme", async () => {
    const { port, settings, theme } = await setup("linux");
    theme.set(true);
    const dark = port.spec?.icon;
    settings.set("tray.iconColor", "dark");
    expect([dark, port.spec?.icon]).toStrictEqual([
      { kind: "tray", shade: "light", unread: true },
      { kind: "tray", shade: "dark", unread: true },
    ]);
  });

  it("hides and shows the window on a click, selecting the first profile with unread mail when asked", async () => {
    const { port, profiles, settings, window, work } = await setup("win32");
    port.click();
    const hidden = window.visible();
    const menu = port.spec?.menu.map((item) =>
      item.kind === "separator" ? "-" : item.label
    );
    settings.set("tray.selectUnread", true);
    port.click();
    expect({
      hidden,
      menu: menu?.[3],
      selected: profiles.selected().id === work,
      shown: window.visible(),
    }).toStrictEqual({
      hidden: false,
      menu: "Show Meru",
      selected: true,
      shown: true,
    });
  });

  it("selects a profile and shows the window from its menu item", async () => {
    const { port, profiles, window, work } = await setup("linux");
    window.hide();
    port.pick("Work (2)");
    expect([profiles.selected().id === work, window.visible()]).toStrictEqual([
      true,
      true,
    ]);
  });

  it("renames a profile's item when the profile is renamed, and keeps the menu as it was when only a tab changes", async () => {
    const { port, profiles, work } = await setup("linux");
    const before = port.spec;
    profiles.addTab(work, "calendar");
    const unchanged = port.spec === before;
    profiles.updateProfile(work, { label: "Office" });
    expect([
      unchanged,
      port.spec?.menu.map((item) =>
        item.kind === "separator" ? "-" : item.label
      ),
    ]).toStrictEqual([
      true,
      ["Personal", "Office (2)", "-", "Hide Meru", "-", "Quit"],
    ]);
  });

  it("on Linux, where any click opens the menu and none reaches the app, hides and shows the window from the menu", async () => {
    const { port, window } = await setup("linux");
    port.pick("Hide Meru");
    const hidden = !window.visible();
    port.pick("Show Meru");
    expect([hidden, window.visible()]).toStrictEqual([true, true]);
    expect(() => {
      port.click();
    }).toThrow("A tray on Linux sends no click");
  });
});
