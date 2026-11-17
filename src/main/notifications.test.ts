import { describe, expect, it } from "vitest";

import type { FeedEntry, FeedOutcome } from "#core/feed.ts";
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

const setup = ({ state = one, hasSubtitle = true } = {}) => {
  const shown: Shown[] = [];
  const opened: [string, string][] = [];
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
  });

  return {
    notifications,
    shown,
    opened,
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
