import { describe, expect, it } from "vitest";

import { isSignIn } from "../../../core/engines/links.ts";
import { groupOf } from "../../../core/engines/ordering.ts";
import { AppEvents } from "../../../core/events.ts";
import { wireName } from "../../../shared/channels/define.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import {
  stagePushes,
  stageSnapshotSchema,
} from "../../../shared/channels/stage.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { commands as allCommands } from "../../../shared/commands/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeViewFactory } from "../../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { RecordingShell } from "../../shell/e2e.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { ShortcutKeys } from "../../shell/keys.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Stages } from "../stage/index.ts";
import { Links } from "./index.ts";

const rethrow = (error: unknown) => {
  throw error;
};

const setup = async () => {
  const window = new FakeWindow(1200, 800);
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ onError: rethrow, transport });
  registrar.assign(window.contentsId, chromeSurface);
  const clock = new FakeClock();
  const settings = new SettingsStore({
    entitlement: () => ({
      deviceLimit: 3,
      expiresAt: null,
      kind: "licensed",
      plan: "pro",
      seat: null,
      source: "stored",
    }),
    events: new AppEvents(),
    lifecycle: new FakeLifecycle(),
    clock,
    fs: new FakeFs(),
    onError: rethrow,
    onFallback: rethrow,
    registrar,
    watchFile: false,
  });
  const views = new FakeViewFactory();
  const events = new AppEvents();
  const commands = new CommandDispatcher();
  const profiles = new Profiles({
    commands,
    lifecycle: new FakeLifecycle(),
    clock,
    entitlement: { expiresAt: null, kind: "unknown", source: "stored" },
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    onError: rethrow,
    registrar,
    report: rethrow,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  const shell = new RecordingShell();
  // As the windows feature does, and ahead of the stages, the window shows the group of the tab last brought to the front.
  let shown: string | undefined;
  events.on("tab.focused", ({ groupId }) => {
    shown = groupId;
  });
  const stages = new Stages({
    keys: new ShortcutKeys({
      commands: allCommands,
      dispatcher: commands,
      platform: "darwin",
      report: rethrow,
      settings,
    }),
    blankPanes: false,
    commands,
    dragPreload: "/dist/preload/drag.cjs",
    overlayPreload: "/dist/preload/renderer.cjs",
    events,
    insets: () => ({ left: 0, top: 0 }),
    onError: rethrow,
    onOpen: (tabId, url, disposition) => links.open(tabId, url, disposition),
    onPopup: (url) => {
      const shows = isSignIn(url);
      if (!shows) {
        shell.openExternal(url);
      }
      return shows;
    },
    profiles,
    registrar,
    settings,
    tabDragUrl: (tab) =>
      `overlay.html?${new URLSearchParams({ appId: tab.appId, kind: "tabDrag", tabId: tab.id }).toString()}`,
    views,
  });
  stages.start();
  const links = new Links({ profiles, settings, shell, stages });
  stages.open(window, () => shown ?? profiles.currentGroup()?.id);
  const changes = (): StageSnapshot[] =>
    transport.sent
      .filter((pushed) => pushed.channel === wireName(stagePushes.changed))
      .map((pushed) => stageSnapshotSchema.parse(pushed.payload));
  return { changes, profiles, settings, shell, views, window };
};

const CALENDAR = "https://calendar.google.com/calendar/r/week";

const tabsOf = (profiles: Profiles, appId: string) =>
  profiles.state.tabs.filter((tab) => tab.appId === appId);

describe(Links, () => {
  it("leaves a page navigating itself and a window onto Google's sign-in to Chromium", async () => {
    const { views, shell } = await setup();
    const [gmail] = views.created;
    expect([
      gmail?.open("https://example.com/"),
      gmail?.open(CALENDAR),
      gmail?.open("https://accounts.google.com/signin", "default"),
      shell.opened,
    ]).toStrictEqual([false, false, false, []]);
  });

  it("loads a link to the pane's own app in the pane", async () => {
    const { views, profiles } = await setup();
    const [gmail] = views.created;
    const url = "https://mail.google.com/mail/u/0/#inbox/abc";
    expect(gmail?.open(url, "default")).toBeTruthy();
    expect([gmail?.url, profiles.state.tabs]).toStrictEqual([
      url,
      [expect.objectContaining({ appId: "gmail" })],
    ]);
  });

  it("sends anything but a Google app to the browser, and every app once Google apps open outside", async () => {
    const { views, shell, settings, profiles } = await setup();
    const [gmail] = views.created;
    gmail?.open("https://example.com/", "default");
    settings.set("links.excludedApps", ["calendar"]);
    gmail?.open(CALENDAR, "default");
    settings.set("links.excludedApps", []);
    settings.set("links.openInApp", false);
    gmail?.open(CALENDAR, "background");
    expect([shell.opened, tabsOf(profiles, "calendar")]).toStrictEqual([
      ["https://example.com/", CALENDAR, CALENDAR],
      [],
    ]);
  });

  it("opens another app's link in a new tab split beside the pane and focuses it", async () => {
    const { views, profiles, changes } = await setup();
    const [gmail] = views.created;
    expect(gmail?.open(CALENDAR, "default")).toBeTruthy();
    const [calendar] = tabsOf(profiles, "calendar");
    const last = changes().at(-1);
    expect({
      focused: last?.panes.find((pane) => pane.paneId === last.focusedPaneId)
        ?.tabId,
      group: profiles.currentGroup()?.tabIds,
      url: calendar?.url,
      viewUrl: views.created[1]?.url,
    }).toStrictEqual({
      focused: calendar?.id,
      group: [profiles.state.tabs[0]?.id, calendar?.id],
      url: CALENDAR,
      viewUrl: CALENDAR,
    });
  });

  it("opens a background tab in a group of its own without showing it, and a window's link as a tab, there being no group windows yet", async () => {
    const { views, profiles, window } = await setup();
    const [gmail] = views.created;
    gmail?.open(CALENDAR, "background");
    const background = {
      calendar: tabsOf(profiles, "calendar").length,
      children: window.childViews().length,
      group: profiles.currentGroup()?.tabIds.length,
    };
    gmail?.open("https://drive.google.com/drive/my-drive", "window");
    const [drive] = tabsOf(profiles, "drive");
    const group = groupOf(drive?.id ?? "", profiles.state.groups);
    expect([background, group?.tabIds]).toStrictEqual([
      { calendar: 1, children: 1, group: 1 },
      [drive?.id],
    ]);
  });

  it("brings the tab already showing the app to the front with the link, Gmail's one tab among them", async () => {
    const { views, profiles } = await setup();
    const [gmail] = views.created;
    gmail?.open(CALENDAR, "default");
    const [, calendarView] = views.created;
    const later = "https://calendar.google.com/calendar/r/day";
    calendarView?.open(
      "https://mail.google.com/mail/u/0/#inbox/xyz",
      "default"
    );
    gmail?.open(later, "default");
    expect({
      calendars: tabsOf(profiles, "calendar").length,
      calendarUrl: calendarView?.url,
      gmailUrl: gmail?.url,
      views: views.created.length,
    }).toStrictEqual({
      calendarUrl: later,
      calendars: 1,
      gmailUrl: "https://mail.google.com/mail/u/0/#inbox/xyz",
      views: 2,
    });
  });

  it("starts a tab no stage keeps a view of yet at the link, rather than losing it", async () => {
    const { views, profiles } = await setup();
    const [gmail] = views.created;
    gmail?.open(CALENDAR, "background");
    const later = "https://calendar.google.com/calendar/r/day";
    gmail?.open(later, "default");
    const [calendar] = tabsOf(profiles, "calendar");
    expect([calendar?.url, views.created[1]?.url]).toStrictEqual([
      later,
      later,
    ]);
  });

  it("shows a blank popup only once it heads for Google's sign-in, and sends anything else to the browser", async () => {
    const { views, shell } = await setup();
    const [gmail] = views.created;
    expect([
      gmail?.popup("https://accounts.google.com/o/oauth2/auth"),
      gmail?.popup("https://example.com/"),
      shell.opened,
    ]).toStrictEqual([true, false, ["https://example.com/"]]);
  });
});
