import { delay } from "es-toolkit";
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

const CODE = "493021";

/** The subject the fake extractor finds a code under, in the summary. */
const CODE_SUBJECT = "Your verification code";

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
  copies = true,
} = {}) => {
  let copying = copies;
  let writing: PromiseWithResolvers<void> | undefined;
  const copied: string[] = [];
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
    clipboard: {
      writeText: async (text) => {
        await writing?.promise;

        if (!copying) {
          throw new Error(`Not written: ${text}`);
        }

        copied.push(text);
      },
    },
    // Fixed, so these tests prove the path and not the extractor.
    extractCode: ([subject, summary]) =>
      subject === CODE_SUBJECT ? /\d{6}/u.exec(summary ?? "")?.[0] : undefined,
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
    copied,
    allowCopies: () => {
      copying = true;
    },
    /** Holds every write until the returned function lets them land. */
    holdCopies: () => {
      writing = Promise.withResolvers();

      return writing.resolve;
    },
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

  it("only records the first feed of another label, and notifies what comes after it", () => {
    const { notifications, shown } = setup();

    notifications.polled("a", feed(entry("1")), "^sq_ig_i_personal");
    // The whole inbox lists Promotions too, which is no new mail.
    notifications.polled("a", feed(entry("3"), entry("2"), entry("1")));
    notifications.polled("a", feed(entry("3"), entry("2"), entry("1")));

    expect(shown).toStrictEqual([]);

    notifications.polled(
      "a",
      feed(entry("4"), entry("3"), entry("2"), entry("1"))
    );

    expect(shown).toStrictEqual([
      expect.objectContaining({ title: "Sender 4" }),
    ]);

    notifications.polled(
      "a",
      feed(entry("5"), entry("1")),
      "^sq_ig_i_personal"
    );

    expect(shown).toHaveLength(1);
  });

  it("keeps what it saw through a failed poll of another label", () => {
    const { notifications, shown } = setup();

    notifications.polled("a", feed(entry("1")), "^sq_ig_i_personal");
    notifications.polled("a", { kind: "failed", reason: "HTTP 500" });
    notifications.polled(
      "a",
      feed(entry("2"), entry("1")),
      "^sq_ig_i_personal"
    );

    expect(shown).toStrictEqual([
      expect.objectContaining({ title: "Sender 2" }),
    ]);
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

/** A message the fake extractor reads `CODE` from. */
const codeEntry = (id: string): FeedEntry => ({
  ...entry(id),
  subject: CODE_SUBJECT,
  summary: `Use ${CODE} to finish signing in`,
});

/** Lets a copy, which settles after the call that starts it, land. */
const settle = () => delay(0);

/** Polls once to see the feed, then brings `entries` as new. */
const arrive = async (
  app: ReturnType<typeof setup>,
  ...entries: FeedEntry[]
) => {
  await app.notifications.polled("a", feed());
  await app.notifications.polled("a", feed(...entries));
  await settle();
};

const content = (shown: Shown[]) =>
  shown.map(({ title, subtitle, body, actions }) => ({
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    body,
    actions,
  }));

describe("verification codes", () => {
  it("shows the code with a Copy button and copies nothing, touching no mail, until it is pressed", async () => {
    const app = setup();

    app.set("verificationCodeMarkRead", true);
    await arrive(app, codeEntry("1"));

    expect(content(app.shown)).toStrictEqual([
      {
        title: "Sender 1",
        body: `Verification code ${CODE}`,
        actions: ["Copy"],
      },
    ]);
    expect([app.copied, app.acted]).toStrictEqual([[], []]);

    app.shown[0]?.events.onAction?.(0);
    await settle();

    expect(app.copied).toStrictEqual([CODE]);
    expect(app.acted).toStrictEqual([["a", "markAsRead", "1"]]);
    expect(app.opened).toStrictEqual([]);
  });

  it("copies on a body click too, and opens the message", async () => {
    const app = setup();

    await arrive(app, codeEntry("1"));
    app.shown[0]?.events.onClick();
    await settle();

    expect(app.copied).toStrictEqual([CODE]);
    expect(app.opened).toStrictEqual([["a", `${INBOX}?message_id=1`]]);
    expect(app.acted).toStrictEqual([]);
  });

  it("copies as it shows in immediately mode, and the mail follows the copy", async () => {
    const app = setup();

    app.set("verificationCodeCopyMode", "immediately");
    app.set("verificationCodeMarkRead", true);
    await arrive(app, codeEntry("1"));

    expect(content(app.shown)).toStrictEqual([
      {
        title: "Sender 1",
        body: `Copied verification code ${CODE}`,
        actions: undefined,
      },
    ]);
    expect(app.copied).toStrictEqual([CODE]);
    expect(app.acted).toStrictEqual([["a", "markAsRead", "1"]]);

    app.shown[0]?.events.onClick();

    expect(app.opened).toStrictEqual([["a", `${INBOX}?message_id=1`]]);
    expect(app.copied).toStrictEqual([CODE]);
  });

  it("moves the mail to Trash rather than marking it read when both are on", async () => {
    const app = setup();

    app.set("verificationCodeCopyMode", "immediately");
    app.set("verificationCodeMarkRead", true);
    app.set("verificationCodeTrash", true);
    await arrive(app, codeEntry("1"));

    expect(app.acted).toStrictEqual([["a", "delete", "1"]]);
  });

  it("when the copy as it arrives fails, touches no mail, logs no code and offers Copy instead", async () => {
    const app = setup({ copies: false });

    app.set("verificationCodeCopyMode", "immediately");
    app.set("verificationCodeTrash", true);
    await arrive(app, codeEntry("1"));

    expect(content(app.shown)).toStrictEqual([
      {
        title: "Sender 1",
        body: `Verification code ${CODE}`,
        actions: ["Copy"],
      },
    ]);
    expect(app.acted).toStrictEqual([]);
    expect(app.logs).toStrictEqual([
      "Found a verification code in a new message of profile a, copying it",
      "A verification code of profile a was not copied",
    ]);

    app.allowCopies();
    app.shown[0]?.events.onAction?.(0);
    await settle();

    expect([app.copied, app.acted]).toStrictEqual([
      [CODE],
      [["a", "delete", "1"]],
    ]);
  });

  it("copies and moves the mail once, however often it is asked", async () => {
    const app = setup();

    app.set("verificationCodeTrash", true);
    await arrive(app, codeEntry("1"));
    app.shown[0]?.events.onAction?.(0);
    app.shown[0]?.events.onClick();
    await settle();

    expect([app.copied, app.acted]).toStrictEqual([
      [CODE],
      [["a", "delete", "1"]],
    ]);
    expect(app.opened).toStrictEqual([["a", `${INBOX}?message_id=1`]]);
  });

  it("copies once while a copy is still being written, after it lands, and again after one fails", async () => {
    const app = setup({ copies: false });

    app.set("verificationCodeTrash", true);
    await arrive(app, codeEntry("1"));

    const press = () => app.shown[0]?.events.onAction?.(0);

    press();
    await settle();

    expect([app.copied, app.acted]).toStrictEqual([[], []]);

    app.allowCopies();

    const land = app.holdCopies();

    press();
    press();
    land();
    await settle();
    press();
    await settle();

    expect([app.copied, app.acted]).toStrictEqual([
      [CODE],
      [["a", "delete", "1"]],
    ]);
  });

  it("touches no mail and shows nothing for a profile removed while the code was copied as it arrived", async () => {
    const app = setup({ state: two });

    app.set("verificationCodeCopyMode", "immediately");
    app.set("verificationCodeMarkRead", true);
    await app.notifications.polled("b", feed());

    const land = app.holdCopies();

    await app.notifications.polled("b", feed(codeEntry("1")));
    app.setState(one);
    land();
    await settle();

    expect([app.copied, app.acted, app.shown]).toStrictEqual([[CODE], [], []]);
  });

  it("shows through every hold while the mail beside it is held", async () => {
    const app = setup({
      doNotDisturb: { until: null },
      important: () => Promise.resolve(new Set()),
    });

    app.set("notifications", false);
    app.set("quietHours", [{ start: "00:00", end: "00:00" }]);
    app.set("notificationImportantOnly", true);
    await arrive(app, entry("2"), codeEntry("1"));

    expect(titles(app.shown)).toStrictEqual(["Sender 1"]);
    expect(app.logs).toStrictEqual([
      "Found a verification code in a new message of profile a, copying it when asked",
      "Held 1 new mail notification(s) of profile a: off",
    ]);
  });

  it("passes important only, which keeps none of the mail beside it", async () => {
    const app = setup({ important: () => Promise.resolve(new Set()) });

    app.set("notificationImportantOnly", true);
    await arrive(app, entry("2"), codeEntry("1"));

    expect(titles(app.shown)).toStrictEqual(["Sender 1"]);
  });

  it("is never told as one of many, nor counted toward that", async () => {
    const app = setup();

    await arrive(app, entry("4"), entry("3"), codeEntry("2"), entry("1"));
    await app.notifications.polled(
      "a",
      feed(entry("9"), entry("8"), entry("7"), entry("6"), codeEntry("5"))
    );

    expect(
      content(app.shown).map(({ title, body }) => [title, body])
    ).toStrictEqual([
      ["Sender 2", `Verification code ${CODE}`],
      ["Sender 1", "Subject 1\nSummary 1"],
      ["Sender 3", "Subject 3\nSummary 3"],
      ["Sender 4", "Subject 4\nSummary 4"],
      ["Sender 5", `Verification code ${CODE}`],
      ["4 new messages", ""],
    ]);
  });

  it("names the profile as a new mail notification does, and leaves the sender out when asked", async () => {
    const app = setup({ state: two });

    app.set("notificationSender", false);
    await app.notifications.polled("b", feed());
    await app.notifications.polled("b", feed(codeEntry("1")));

    expect(content(app.shown)).toStrictEqual([
      {
        title: "New message",
        subtitle: "Work",
        body: `Verification code ${CODE}`,
        actions: ["Copy"],
      },
    ]);
  });

  it("notifies the mail as any other with verification codes off", async () => {
    const app = setup();

    app.set("verificationCodes", false);
    await arrive(app, codeEntry("1"));

    expect(content(app.shown)).toStrictEqual([
      {
        title: "Sender 1",
        body: `Your verification code\nUse ${CODE} to finish signing in`,
        actions: ["Archive", "Mark as Read", "Delete", "Mark as Spam"],
      },
    ]);
    expect(app.logs).toStrictEqual([]);
  });

  it("logs that a code was found and what was done, never the code or its mail", async () => {
    const app = setup();

    app.set("verificationCodeCopyMode", "immediately");
    app.set("verificationCodeTrash", true);
    await arrive(app, codeEntry("1"));

    expect(app.logs).toStrictEqual([
      "Found a verification code in a new message of profile a, copying it",
      "Copied a verification code of profile a, then ran delete",
    ]);
  });
});
