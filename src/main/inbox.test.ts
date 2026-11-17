import { describe, expect, it } from "vitest";

import type { FeedEntry, FeedOutcome, MailStatus } from "#core/feed.ts";
import type { ActionOutcome, MailAction } from "#core/mail-actions.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createInbox } from "./inbox.ts";

const GMAIL = "https://mail.google.com/mail/u/0/";

const entry = (id: string, issued: number): FeedEntry => ({
  id,
  link: `https://mail.google.com/mail/u/0/?view=cv&message_id=${id}`,
  subject: `Subject ${id}`,
  summary: "",
  senderName: `Sender ${id}`,
  senderAddress: `${id}@example.com`,
  issued,
});

const two: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "" }],
    },
    newProfile("b", "Work"),
  ],
  selectedProfileId: "a",
};

const feedOf = (entries: FeedEntry[]): FeedOutcome => ({
  kind: "feed",
  feed: { unreadCount: entries.length, entries },
});

const setup = (initial: State = two) => {
  const feeds: Record<string, { status: MailStatus; entries: FeedEntry[] }> = {
    a: { status: "ok", entries: [entry("a1", 30), entry("a2", 10)] },
    b: { status: "ok", entries: [entry("b1", 20)] },
  };
  const runs: {
    profileId: string;
    action: MailAction;
    messageId: string;
    settle: (outcome: ActionOutcome) => void;
  }[] = [];
  const opened: [string, string][] = [];
  const logs: string[] = [];
  const overlay = { open: false, opens: 0, closes: 0 };
  let changes = 0;
  let clock = 1000;

  const inbox = createInbox({
    mail: {
      mail: (profileId) => ({
        status: feeds[profileId]?.status ?? "unknown",
        unreadCount: feeds[profileId]?.entries.length ?? null,
      }),
      entries: (profileId) => feeds[profileId]?.entries ?? [],
    },
    run: (profileId, action, messageId) => {
      const { promise, resolve } = Promise.withResolvers<ActionOutcome>();

      runs.push({ profileId, action, messageId, settle: resolve });

      return promise;
    },
    open: (profileId, url) => {
      opened.push([profileId, url]);

      return Promise.resolve();
    },
    inbox: GMAIL,
    initial,
    overlay: {
      isOpen: () => overlay.open,
      open: () => {
        overlay.open = true;
        overlay.opens += 1;
      },
      close: () => {
        overlay.open = false;
        overlay.closes += 1;
      },
    },
    now: () => clock,
    log: (message) => logs.push(message),
  });

  inbox.onChange(() => {
    changes += 1;
  });

  const rows = () =>
    inbox.shellSlice().rows.map((row) => `${row.profileId}/${row.messageId}`);

  return {
    inbox,
    feeds,
    runs,
    opened,
    logs,
    rows,
    overlay,
    changes: () => changes,
    tick: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
    /** A poll of the profile that started at `startedAt` read `entries`. */
    poll: (profileId: string, entries: FeedEntry[], startedAt: number) => {
      const feed = feeds[profileId];

      if (feed) {
        feed.entries = entries;
      }

      inbox.polled(profileId, feedOf(entries), startedAt);
    },
  };
};

describe(createInbox, () => {
  it("sends nothing of any mail while closed, and every profile's mail newest first while open", () => {
    const app = setup();

    expect(app.inbox.shellSlice()).toStrictEqual({
      open: false,
      profiles: [],
      rows: [],
      notice: null,
    });

    app.inbox.setOpen(true);

    expect(app.rows()).toStrictEqual(["a/a1", "b/b1", "a/a2"]);
    expect(app.inbox.shellSlice().profiles).toStrictEqual([
      {
        id: "a",
        name: "Default",
        status: "ok",
        unreadCount: 2,
        listed: 2,
      },
      { id: "b", name: "Work", status: "ok", unreadCount: 1, listed: 1 },
    ]);
  });

  it("opens its overlay once and closes it once, however often asked", () => {
    const app = setup();

    app.inbox.setOpen(true);
    app.inbox.setOpen(true);
    app.inbox.setOpen(false);
    app.inbox.setOpen(false);

    expect([app.overlay.opens, app.overlay.closes]).toStrictEqual([1, 1]);
  });

  it("does not open with one profile, and closes when one is left", () => {
    const one = setup({ ...two, profiles: [newProfile("a", "Default")] });

    one.inbox.setOpen(true);

    expect(one.inbox.isOpen()).toBeFalsy();

    const app = setup();

    app.inbox.setOpen(true);
    app.inbox.follow({ ...two, profiles: [newProfile("a", "Default")] });

    expect(app.inbox.isOpen()).toBeFalsy();
  });

  it("stays open when another profile or tab is selected, which closes it through the request that selected", () => {
    const app = setup();

    app.inbox.setOpen(true);
    app.inbox.follow({ ...two, doNotDisturb: { until: null } });
    app.inbox.follow({ ...two, selectedProfileId: "b" });

    expect(app.inbox.isOpen()).toBeTruthy();
  });

  it("opens a listed message at its link in its profile, leaving the close to what shows it", async () => {
    const app = setup();

    app.inbox.setOpen(true);
    await app.inbox.openMessage("b", "b1");

    expect(app.opened).toStrictEqual([
      ["b", "https://mail.google.com/mail/u/0/?view=cv&message_id=b1"],
    ]);
  });

  it("opens Gmail's inbox for a link that is not Gmail's", async () => {
    const app = setup();

    app.feeds.a = {
      status: "ok",
      entries: [
        { ...entry("a9", 1), link: "https://example.com/?message_id=a9" },
      ],
    };
    app.inbox.setOpen(true);
    await app.inbox.openMessage("a", "a9");

    expect(app.opened).toStrictEqual([["a", GMAIL]]);
  });

  it("refuses to open or act on what it does not list: another profile's id, an unknown profile, a closed inbox, a feed that does not read", async () => {
    const app = setup();

    await app.inbox.openMessage("a", "a1");
    await app.inbox.runAction("a", "a1", "archive");
    app.inbox.setOpen(true);
    await app.inbox.openMessage("a", "b1");
    await app.inbox.openMessage("z", "a1");
    await app.inbox.runAction("b", "a1", "archive");
    app.feeds.b = { status: "signedOut", entries: [entry("b1", 20)] };
    await app.inbox.runAction("b", "b1", "delete");
    app.feeds.b = { status: "failed", entries: [entry("b1", 20)] };
    await app.inbox.runAction("b", "b1", "delete");

    expect(app.opened).toStrictEqual([]);
    expect(app.runs).toStrictEqual([]);
    expect(app.logs).toHaveLength(7);
    expect(app.logs.join("\n")).not.toMatch(/Subject|Sender|example/u);
  });

  it("shows no rows of a profile whose feed does not read", () => {
    const app = setup();

    app.feeds.b = { status: "failed", entries: [entry("b1", 20)] };
    app.inbox.setOpen(true);

    expect(app.rows()).toStrictEqual(["a/a1", "a/a2"]);
    expect(app.inbox.shellSlice().profiles[1]).toMatchObject({
      status: "failed",
      listed: 0,
    });
  });

  it("removes a row at once, runs the action for its profile, and keeps it hidden until a poll started after it confirms", async () => {
    const app = setup();

    app.inbox.setOpen(true);
    await Promise.all([
      app.inbox.runAction("b", "b1", "archive"),
      (async () => {
        expect(app.rows()).toStrictEqual(["a/a1", "a/a2"]);
        expect(
          app.runs.map(({ profileId, action, messageId }) => [
            profileId,
            action,
            messageId,
          ])
        ).toStrictEqual([["b", "archive", "b1"]]);
        // A second press while it runs sends nothing more.
        await app.inbox.runAction("b", "b1", "archive");
        expect(app.runs).toHaveLength(1);
        app.runs[0]?.settle({ kind: "ok" });
      })(),
    ]);

    const okAt = app.now();

    // A poll in flight as it ran still lists it.
    app.poll("b", [entry("b1", 20)], okAt - 500);

    expect(app.rows()).toStrictEqual(["a/a1", "a/a2"]);

    app.tick(5000);
    app.poll("b", [], okAt + 1);

    expect(app.rows()).toStrictEqual(["a/a1", "a/a2"]);
    expect(app.inbox.shellSlice().notice).toBeNull();
  });

  it("gives a row back when the feed after its action still lists it", async () => {
    const app = setup();

    app.inbox.setOpen(true);

    const running = app.inbox.runAction("a", "a1", "markAsRead");

    app.runs[0]?.settle({ kind: "ok" });
    await running;
    app.poll("a", [entry("a1", 30), entry("a2", 10)], app.now() + 1);

    expect(app.rows()).toStrictEqual(["a/a1", "b/b1", "a/a2"]);
  });

  it("puts a failed action's row back and says why, until the next action or a close", async () => {
    const app = setup();

    app.inbox.setOpen(true);

    const failing = app.inbox.runAction("a", "a1", "delete");

    expect(app.rows()).toStrictEqual(["b/b1", "a/a2"]);
    app.runs[0]?.settle({ kind: "failed", reason: "timed out" });
    await failing;

    expect([app.rows(), app.inbox.shellSlice().notice]).toStrictEqual([
      ["a/a1", "b/b1", "a/a2"],
      { action: "delete", profileId: "a", reason: "failed" },
    ]);

    const signedOut = app.inbox.runAction("b", "b1", "markAsSpam");

    expect(app.inbox.shellSlice().notice).toBeNull();
    app.runs[1]?.settle({ kind: "signedOut" });
    await signedOut;

    expect(app.inbox.shellSlice().notice).toStrictEqual({
      action: "markAsSpam",
      profileId: "b",
      reason: "signedOut",
    });

    app.inbox.setOpen(false);
    app.inbox.setOpen(true);

    expect(app.inbox.shellSlice().notice).toBeNull();
  });

  it("tells nothing on the next open of a failure that landed while it was closed", async () => {
    const app = setup();

    app.inbox.setOpen(true);

    const failing = app.inbox.runAction("a", "a1", "archive");

    app.inbox.setOpen(false);
    app.runs[0]?.settle({ kind: "failed", reason: "timed out" });
    await failing;
    app.inbox.setOpen(true);

    expect([app.rows(), app.inbox.shellSlice().notice]).toStrictEqual([
      ["a/a1", "b/b1", "a/a2"],
      null,
    ]);
  });

  it("forgets a removed profile's actions, and ignores what they come to", async () => {
    const app = setup();

    app.inbox.setOpen(true);

    const running = app.inbox.runAction("b", "b1", "archive");

    app.inbox.follow({
      ...two,
      profiles: [...two.profiles, newProfile("c", "Third")].filter(
        (profile) => profile.id !== "b"
      ),
    });
    app.runs[0]?.settle({ kind: "failed", reason: "profile removed" });
    await running;

    expect(app.inbox.shellSlice().notice).toBeNull();
    expect(app.rows()).toStrictEqual(["a/a1", "a/a2"]);
  });

  it("tells of each poll while open, so a changed list reaches the shell", () => {
    const app = setup();

    app.poll("a", [entry("a3", 40)], 0);

    expect(app.changes()).toBe(0);

    app.inbox.setOpen(true);
    app.poll("a", [entry("a3", 40)], 0);

    expect(app.changes()).toBe(1);
    expect(app.rows()).toStrictEqual(["a/a3", "b/b1"]);
  });
});
