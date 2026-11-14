import { setImmediate } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { parseFeed } from "../../../core/engines/feed.ts";
import { GMAIL_URL } from "../../../core/engines/inbox.ts";
import { AppEvents } from "../../../core/events.ts";
import { TWO_UNREAD } from "../../../core/fixtures/gmail-feeds.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import { gmail } from "../../../shared/apps.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { strictLog } from "../../../test/fakes/log.ts";
import { FakeNotifications } from "../../../test/fakes/notifications.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Notifications } from "./index.ts";

const PRO: Entitlement = {
  deviceLimit: 3,
  expiresAt: null,
  kind: "licensed",
  plan: "pro",
  seat: null,
  source: "stored",
};

const parsed = parseFeed(TWO_UNREAD);
const entries = parsed.ok ? parsed.value.entries.toReversed() : [];
const [older, newest] = entries;

const setup = async () => {
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ log: strictLog, transport });
  registrar.assign(3, chromeSurface);
  const lifecycle = new FakeLifecycle();
  const clock = new FakeClock();
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
    entitlement: () => PRO,
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
  const port = new FakeNotifications();
  const loaded: string[] = [];
  let shown = 0;
  const important = new Set([newest?.id ?? ""]);
  const notifications = new Notifications({
    events,
    inbox: { important: async () => await Promise.resolve(important) },
    gmailUrl: GMAIL_URL,
    load: (_tabId, url) => {
      loaded.push(url);
    },
    notifications: port,
    platform: "darwin",
    profiles,
    settings,
    showWindow: () => {
      shown += 1;
    },
  });
  notifications.start();
  const first = profiles.selected().id;
  const arrive = async (profileId = first, arrived = entries) => {
    events.emit("mail.arrived", { entries: arrived, profileId });
    await setImmediate();
  };
  return {
    arrive,
    first,
    loaded,
    port,
    profiles,
    settings,
    shown: () => shown,
  };
};

describe(Notifications, () => {
  it("shows one notification per new email, oldest first, as the settings word it", async () => {
    const { arrive, port, settings } = await setup();
    settings.set("notifications.showSummary", false);
    settings.set("notifications.playSound", false);
    await arrive();
    expect(port.shown.map((shown) => shown.spec)).toStrictEqual([
      { silent: true, subtitle: "2024", title: "12345" },
      {
        silent: true,
        subtitle: 'Q3 & Q4 "plans" – Tom\'s draft',
        title: "Tom O'Brien",
      },
    ]);
  });

  it("names the profile once there are several, and shows nothing for a profile whose notifications are off", async () => {
    const { arrive, first, port, profiles, settings } = await setup();
    const work = profiles.createProfile("Work");
    const workId = work.ok ? work.value.id : "";
    settings.set("notifications.enabled", false, first);
    await arrive();
    await arrive(workId);
    expect(port.shown.map((shown) => shown.spec.title)).toStrictEqual([
      "[Work] 12345",
      "[Work] Tom O'Brien",
    ]);
  });

  it("notifies only about important email when asked", async () => {
    const { arrive, port, settings } = await setup();
    settings.set("notifications.newEmails", "important");
    await arrive();
    expect(port.shown.map((shown) => shown.spec.title)).toStrictEqual([
      "Tom O'Brien",
    ]);
  });

  it("opens the message in the profile's Gmail tab when a notification is clicked, leaving the tab's own address as it was", async () => {
    const { arrive, loaded, port, profiles, shown } = await setup();
    await arrive();
    port.shown[0]?.click();
    const tab = profiles.state.tabs.find((found) => found.appId === gmail.id);
    expect({ loaded, shown: shown(), url: tab?.url }).toStrictEqual({
      loaded: [`https://mail.google.com/mail/u/0/#inbox/${older?.messageId}`],
      shown: 1,
      url: gmail.url,
    });
  });

  it("raises one notification for more new emails than a handful, which opens the inbox", async () => {
    const { arrive, loaded, port } = await setup();
    const many = Array.from({ length: 6 }, (_, index) => ({
      ...older,
      id: `entry-${index}`,
      messageId: `m${index}`,
      subject: `Subject ${index}`,
      summary: "",
      link: "",
      author: { email: "a@example.com", name: "A" },
      issued: index,
    }));
    await arrive(undefined, many);
    port.shown[0]?.click();
    expect({
      loaded,
      shown: port.shown.map((shown) => shown.spec),
    }).toStrictEqual({
      loaded: ["https://mail.google.com/mail/u/0/#inbox"],
      shown: [{ silent: false, title: "6 new emails" }],
    });
  });
});
