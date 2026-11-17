import { describe, expect, it } from "vitest";

import type { FeedEntry, FeedOutcome } from "#core/feed.ts";
import type { MailAction } from "#core/mail-actions.ts";
import { SETTINGS } from "#core/settings.ts";
import type { SettingKey } from "#core/settings.ts";
import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type {
  NotificationContent,
  NotificationEvents,
  Notifier,
} from "#platform/notifications.ts";

import { createMailNotifications } from "./notifications.ts";

const INBOX = "https://mail.google.com/mail/u/0";

const entry = (id: string, link = `${INBOX}?message_id=${id}`): FeedEntry => ({
  id,
  link,
  subject: `Subject ${id}`,
  summary: `Summary ${id}`,
  senderName: `Sender ${id}`,
  senderAddress: `${id}@example.com`,
  issued: 0,
});

const feed = (...entries: FeedEntry[]): FeedOutcome => ({
  kind: "feed",
  feed: { unreadCount: entries.length, entries },
});

const one: State = {
  version: 1,
  profiles: [newProfile("a", "Default")],
  selectedProfileId: "a",
};

const two: State = {
  ...one,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
};

interface Shown extends NotificationContent {
  events: NotificationEvents;
  closed: boolean;
}

const setup = ({
  state = one,
  hasSubtitle = true,
  // Tuesday 17 November 2026, 14:00 by the local clock.
  now = new Date(2026, 10, 17, 14),
  doNotDisturb: holding = undefined as State["doNotDisturb"],
  important = (): Promise<ReadonlySet<string> | null> => Promise.resolve(null),
} = {}) => {
  const shown: Shown[] = [];
  const logs: string[] = [];
  let doNotDisturb = holding;
  const askedImportant: string[] = [];
  const opened: [string, string][] = [];
  const acted: [string, MailAction, string][] = [];
  const settings = new Map<SettingKey, unknown>();
  let current = state;
  const notifier: Notifier = {
    show: (content, events) => {
      const notification: Shown = { ...content, events, closed: false };

      shown.push(notification);

      return {
        close: () => {
          notification.closed = true;
          events.onGone();
        },
      };
    },
  };
  const notifications = createMailNotifications({
    notifier,
    setting: (key) =>
      (settings.has(key) ? settings.get(key) : SETTINGS[key].default) as never,
    state: () => current,
    hasSubtitle,
    inbox: INBOX,
    open: (profileId, url) => {
      opened.push([profileId, url]);
    },
    act: (profileId, action, messageId) => {
      acted.push([profileId, action, messageId]);
    },
    doNotDisturb: () => doNotDisturb,
    now: () => now,
    important: (profileId) => {
      askedImportant.push(profileId);

      return important();
    },
    log: (message) => {
      logs.push(message);
    },
  });

  return {
    notifications,
    shown,
    opened,
    acted,
    logs,
    askedImportant,
    switchDoNotDisturb: (next: State["doNotDisturb"]) => {
      doNotDisturb = next;
    },
    set: (key: SettingKey, value: unknown) => {
      settings.set(key, value);
    },
    setState: (next: State) => {
      current = next;
      notifications.follow(next);
    },
  };
};

describe(createMailNotifications, () => {
  it("notifies a message that arrives after the first poll, once", () => {
    const { notifications, shown } = setup();

    notifications.polled("a", feed(entry("1")));
    notifications.polled("a", feed(entry("2"), entry("1")));
    notifications.polled("a", feed(entry("2"), entry("1")));

    expect(shown).toStrictEqual([
      expect.objectContaining({
        title: "Sender 2",
        body: "Subject 2\nSummary 2",
      }),
    ]);
    expect(shown[0]).not.toHaveProperty("subtitle");
  });

  it("names the profile when there is more than one, as the system can", () => {
    const mac = setup({ state: two });
    const elsewhere = setup({ state: two, hasSubtitle: false });

    for (const { notifications } of [mac, elsewhere]) {
      notifications.polled("b", feed());
      notifications.polled("b", feed(entry("1")));
    }

    expect(mac.shown[0]).toMatchObject({ title: "Sender 1", subtitle: "Work" });
    expect(elsewhere.shown[0]).toMatchObject({
      title: "Sender 1",
      body: "Work\nSubject 1\nSummary 1",
    });
  });

  it("shows none while off, still recording what was seen", () => {
    const { notifications, shown, set } = setup();

    set("notifications", false);
    notifications.polled("a", feed());
    notifications.polled("a", feed(entry("1")));

    expect(shown).toHaveLength(0);

    set("notifications", true);
    notifications.polled("a", feed(entry("2"), entry("1")));

    expect(shown.map((notification) => notification.title)).toStrictEqual([
      "Sender 2",
    ]);
  });

  it("reads which parts to show as each notification is made", () => {
    const { notifications, shown, set } = setup();

    notifications.polled("a", feed());
    set("notificationSender", false);
    set("notificationSummary", false);
    notifications.polled("a", feed(entry("1")));

    expect(shown[0]).toMatchObject({ title: "New message", body: "Subject 1" });
  });

  it("tells more than three at once as one, translated and counted", () => {
    const { notifications, shown } = setup();

    notifications.polled("a", feed());
    notifications.polled(
      "a",
      feed(entry("4"), entry("3"), entry("2"), entry("1"))
    );

    expect(shown).toStrictEqual([
      expect.objectContaining({ title: "4 new messages", body: "" }),
    ]);
  });

  it("opens the message a click is on in its profile, and the inbox for a link elsewhere or many", () => {
    const { notifications, shown, opened } = setup({ state: two });

    notifications.polled("b", feed());
    notifications.polled("b", feed(entry("1")));
    notifications.polled(
      "b",
      feed(entry("2", "https://example.com/?message_id=2"), entry("1"))
    );
    notifications.polled(
      "b",
      feed(entry("6"), entry("5"), entry("4"), entry("3"), entry("2"))
    );

    for (const notification of shown) {
      notification.events.onClick();
    }

    expect(opened).toStrictEqual([
      ["b", `${INBOX}?message_id=1`],
      ["b", INBOX],
      ["b", INBOX],
    ]);
  });

  it("offers v3's four actions on one message, and none on many", () => {
    const { notifications, shown } = setup();

    notifications.polled("a", feed());
    notifications.polled("a", feed(entry("1")));
    notifications.polled(
      "a",
      feed(entry("5"), entry("4"), entry("3"), entry("2"), entry("1"))
    );

    expect(shown.map((notification) => notification.actions)).toStrictEqual([
      ["Archive", "Mark as Read", "Delete", "Mark as Spam"],
      undefined,
    ]);
  });

  it("runs the pressed action on its message in its profile, opening nothing", () => {
    const { notifications, shown, opened, acted } = setup({ state: two });

    notifications.polled("b", feed());
    notifications.polled("b", feed(entry("2"), entry("1")));

    for (const [index, notification] of shown.entries()) {
      notification.events.onAction?.(index === 0 ? 3 : 1);
    }

    expect(acted).toStrictEqual([
      ["b", "markAsSpam", "1"],
      ["b", "markAsRead", "2"],
    ]);
    expect(opened).toStrictEqual([]);
  });

  it("closes a removed profile's notifications and forgets what it saw", () => {
    const { notifications, shown, setState } = setup({ state: two });

    notifications.polled("a", feed());
    notifications.polled("b", feed());
    notifications.polled("a", feed(entry("1")));
    notifications.polled("b", feed(entry("2")));
    setState(one);

    expect(shown.map((notification) => notification.closed)).toStrictEqual([
      false,
      true,
    ]);

    notifications.polled("b", feed(entry("3"), entry("2")));
    setState(two);
    notifications.polled("b", feed(entry("3"), entry("2")));

    expect(shown).toHaveLength(2);
  });
});

const titles = (shown: Shown[]) =>
  shown.map((notification) => notification.title);

describe("what holds a new mail notification", () => {
  it("holds mail while Do Not Disturb is on, for good, and logs only why", async () => {
    const app = setup({ doNotDisturb: { until: null } });

    await app.notifications.polled("a", feed());
    await app.notifications.polled("a", feed(entry("1")));

    expect(app.shown).toStrictEqual([]);
    expect(app.logs).toStrictEqual([
      "Held 1 new mail notification(s) of profile a: doNotDisturb",
    ]);
  });

  it("notifies again once Do Not Disturb has ended, never the mail it held", async () => {
    const now = new Date(2026, 10, 17, 14);
    const app = setup({ now, doNotDisturb: { until: now.getTime() } });

    await app.notifications.polled("a", feed());
    await app.notifications.polled("a", feed(entry("1")));

    expect(titles(app.shown)).toStrictEqual(["Sender 1"]);
  });

  it("holds mail in quiet hours and asks nothing of the Important feed then", async () => {
    const app = setup({ important: () => Promise.resolve(new Set(["1"])) });

    app.set("notificationImportantOnly", true);
    app.set("quietHours", [{ start: "13:00", end: "15:00" }]);
    await app.notifications.polled("a", feed());
    await app.notifications.polled("a", feed(entry("1")));

    expect(app.shown).toStrictEqual([]);
    expect(app.askedImportant).toStrictEqual([]);
    expect(app.logs).toStrictEqual([
      "Held 1 new mail notification(s) of profile a: quietHours",
    ]);
  });

  it("notifies only what the Important feed lists too, and counts only that", async () => {
    const app = setup({
      important: () => Promise.resolve(new Set(["2", "5", "6", "7", "x"])),
    });

    app.set("notificationImportantOnly", true);
    await app.notifications.polled("a", feed());

    expect(app.askedImportant).toStrictEqual([]);

    await app.notifications.polled("a", feed(entry("2"), entry("1")));
    await app.notifications.polled(
      "a",
      feed(entry("7"), entry("6"), entry("5"), entry("4"), entry("3"))
    );

    expect(titles(app.shown)).toStrictEqual([
      "Sender 2",
      "Sender 5",
      "Sender 6",
      "Sender 7",
    ]);
    expect(app.askedImportant).toStrictEqual(["a", "a"]);
  });

  it("notifies nothing when the Important feed is empty", async () => {
    const app = setup({ important: () => Promise.resolve(new Set()) });

    app.set("notificationImportantOnly", true);
    await app.notifications.polled("a", feed());
    await app.notifications.polled("a", feed(entry("1")));

    expect(app.shown).toStrictEqual([]);
  });

  it("notifies every new message when the Important feed fails, rather than lose one", async () => {
    const app = setup();

    app.set("notificationImportantOnly", true);
    await app.notifications.polled("a", feed());
    await app.notifications.polled("a", feed(entry("2"), entry("1")));

    expect(titles(app.shown)).toStrictEqual(["Sender 1", "Sender 2"]);
    expect(app.logs).toStrictEqual([
      "The Important feed of profile a was not read, so all new mail is notified",
    ]);
  });

  it("holds what Do Not Disturb, switched on while the Important feed was read, holds", async () => {
    const answer = Promise.withResolvers<ReadonlySet<string>>();
    const app = setup({ important: () => answer.promise });

    app.set("notificationImportantOnly", true);
    await app.notifications.polled("a", feed());

    const polled = app.notifications.polled("a", feed(entry("1")));

    app.switchDoNotDisturb({ until: null });
    answer.resolve(new Set(["1"]));
    await polled;

    expect(app.shown).toStrictEqual([]);
    expect(app.logs).toStrictEqual([
      "Held 1 new mail notification(s) of profile a: doNotDisturb",
    ]);
  });

  it("shows nothing for a profile removed while the Important feed was read", async () => {
    const answer = Promise.withResolvers<ReadonlySet<string>>();
    const app = setup({ important: () => answer.promise });

    app.set("notificationImportantOnly", true);
    await app.notifications.polled("a", feed());

    const polled = app.notifications.polled("a", feed(entry("1")));

    app.setState({ ...one, profiles: [newProfile("z", "Other")] });
    answer.resolve(new Set(["1"]));
    await polled;

    expect(app.shown).toStrictEqual([]);
  });
});
