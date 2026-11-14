import { setImmediate } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { GMAIL_URL, INBOX_FEED_URL } from "../../../core/engines/inbox.ts";
import {
  MORE_THAN_LISTED,
  NONE_UNREAD,
  ONE_UNREAD,
  TWO_UNREAD,
} from "../../../core/fixtures/gmail-feeds.ts";
import type { FeedEntry } from "../../../core/records/feed.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeLog } from "../../../test/fakes/log.ts";
import { FakeOnline } from "../../../test/fakes/online.ts";
import { FakePower } from "../../../test/fakes/power.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { PRO, testApp } from "../../testing.ts";
import { Inbox } from "./index.ts";

const PAGE = 3;

const feed = (text: string) =>
  ({ kind: "answered", status: 200, text }) as const;

const SIGNED_OUT = {
  kind: "redirected",
  location: "https://accounts.google.com/ServiceLogin?service=mail",
  status: 302,
} as const;

// A read awaits the session, then its answer; a macrotask runs only once every microtask they queue has.
const settle = async () => {
  await setImmediate();
};

const setup = async ({ online = true } = {}) => {
  const clock = new FakeClock(Date.parse("2026-11-13T08:01:00Z"));
  const sessions = new FakeSessions(clock);
  const { events, profiles, registrar, settings } = await testApp({
    clock,
    entitlement: () => PRO,
    sessions,
  });
  registrar.assign(PAGE, chromeSurface);
  sessions.answer(INBOX_FEED_URL, feed(NONE_UNREAD));
  const network = new FakeOnline(online);
  const power = new FakePower();
  const log = new FakeLog();
  const arrived: { profileId: string; subjects: string[] }[] = [];
  events.on("mail.arrived", ({ profileId, entries }) => {
    arrived.push({
      profileId,
      subjects: entries.map((entry: FeedEntry) => entry.subject),
    });
  });
  const inbox = new Inbox({
    clock,
    events,
    gmailUrl: GMAIL_URL,
    log: log.scoped("inbox"),
    online: network,
    power,
    profiles,
    sessions,
    settings,
  });
  const first = profiles.selected().id;
  const status = (profileId = first) => profiles.profile(profileId)?.status;
  let changed = 0;
  events.on("inbox.changed", () => {
    changed += 1;
  });
  const pushed = () => changed;
  const start = async () => {
    inbox.start();
    await settle();
  };
  const advance = async (milliseconds: number) => {
    clock.advance(milliseconds);
    await settle();
  };
  return {
    advance,
    arrived,
    first,
    inbox,
    log,
    network,
    power,
    profiles,
    pushed,
    sessions,
    settings,
    start,
    status,
  };
};

describe(Inbox, () => {
  it("reads each profile's feed through its own session at once, and gives its status, the pages and the total the count the feed states", async () => {
    const { first, inbox, profiles, pushed, sessions, start, status } =
      await setup();
    const second = profiles.createProfile("Work");
    const secondId = second.ok ? second.value.id : "";
    sessions.answer(INBOX_FEED_URL, feed(MORE_THAN_LISTED), partitionOf(first));
    sessions.answer(INBOX_FEED_URL, feed(ONE_UNREAD), partitionOf(secondId));
    await start();
    expect({
      partitions: sessions.fetched
        .map((fetched) => fetched.partition)
        .toSorted(),
      pushed: pushed() > 0,
      snapshot: inbox.feeds()[secondId]?.unread,
      statuses: [status(), status(secondId)],
      total: inbox.total(),
    }).toStrictEqual({
      partitions: [partitionOf(first), partitionOf(secondId)].toSorted(),
      pushed: true,
      snapshot: 1,
      statuses: [
        { kind: "ok", unreadCount: 57 },
        { kind: "ok", unreadCount: 1 },
      ],
      total: 58,
    });
  });

  it("calls mail new only once a later read lists it, oldest first, and reads again every 30 seconds", async () => {
    const { advance, arrived, first, sessions, start } = await setup();
    sessions.answer(INBOX_FEED_URL, feed(ONE_UNREAD));
    await start();
    sessions.answer(INBOX_FEED_URL, feed(TWO_UNREAD));
    await advance(30_000);
    await advance(30_000);
    expect({ arrived, reads: sessions.fetched.length }).toStrictEqual({
      arrived: [
        {
          profileId: first,
          subjects: ["2024", 'Q3 & Q4 "plans" – Tom\'s draft'],
        },
      ],
      reads: 3,
    });
  });

  it("marks a profile whose session is sent to sign in, waits twice as long after each failure, and is back to every 30 seconds once the feed reads", async () => {
    const { advance, sessions, start, status } = await setup();
    sessions.answer(INBOX_FEED_URL, SIGNED_OUT);
    await start();
    const signedOut = status();
    await advance(60_000);
    await advance(119_000);
    const failing = sessions.fetched.length;
    sessions.answer(INBOX_FEED_URL, feed(ONE_UNREAD));
    await advance(1000);
    await advance(30_000);
    expect({
      failing,
      reads: sessions.fetched.length,
      signedOut,
      status: status(),
    }).toStrictEqual({
      failing: 2,
      reads: 4,
      signedOut: { kind: "needsSignIn" },
      status: { kind: "ok", unreadCount: 1 },
    });
  });

  it("writes one warning for a run of failures rather than one per read", async () => {
    const { advance, log, sessions, start } = await setup();
    sessions.answer(INBOX_FEED_URL, new Error("offline"));
    await start();
    await advance(60_000);
    await advance(120_000);
    sessions.answer(INBOX_FEED_URL, feed(NONE_UNREAD));
    await advance(240_000);
    sessions.answer(INBOX_FEED_URL, {
      kind: "answered",
      status: 500,
      text: "",
    });
    await advance(30_000);
    expect({
      reads: sessions.fetched.length,
      warnings: log.at("warn"),
    }).toStrictEqual({
      reads: 5,
      warnings: [
        "The inbox feed could not be read",
        "The inbox feed could not be read",
      ],
    });
  });

  it("reads nothing while offline, and reads at once when the network or the machine comes back", async () => {
    const { network, power, sessions, start } = await setup({ online: false });
    await start();
    const offline = sessions.fetched.length;
    network.set(true);
    await settle();
    power.resume();
    await settle();
    expect([offline, sessions.fetched.length]).toStrictEqual([0, 2]);
  });

  it("stops reading a profile once it is removed", async () => {
    const { advance, inbox, profiles, sessions, start } = await setup();
    const work = profiles.createProfile("Work");
    const workId = work.ok ? work.value.id : "";
    await start();
    profiles.removeProfile(workId);
    const before = sessions.fetched.length;
    await advance(30_000);
    expect({
      followed: Object.keys(inbox.feeds()).length,
      reads: sessions.fetched.length - before,
    }).toStrictEqual({ followed: 1, reads: 1 });
  });

  it("gives up on a read nothing answers after 20 seconds, and on a body past the cap, each as a failure of its own cause, and says once when the feed reads again", async () => {
    const { advance, log, sessions, start, status } = await setup();
    sessions.answer(INBOX_FEED_URL, "silent");
    await start();
    await advance(20_000);
    sessions.answer(
      INBOX_FEED_URL,
      feed(`${ONE_UNREAD}${" ".repeat(1024 * 1024)}`)
    );
    await advance(60_000);
    await advance(120_000);
    sessions.answer(INBOX_FEED_URL, feed(ONE_UNREAD));
    await advance(240_000);
    expect({
      lines: log.entries.map((entry) => [
        entry.level,
        entry.fields.cause ?? null,
      ]),
      reads: sessions.fetched.length,
      status: status(),
    }).toStrictEqual({
      lines: [
        ["warn", "network"],
        ["warn", "tooLarge"],
        ["info", null],
      ],
      reads: 4,
      status: { kind: "ok", unreadCount: 1 },
    });
  });

  it("reads again as soon as a read that hung ends when one was asked for meanwhile, and only once", async () => {
    const { advance, inbox, sessions, start, status } = await setup();
    sessions.answer(INBOX_FEED_URL, "silent");
    await start();
    inbox.readAll();
    inbox.readAll();
    await advance(1000);
    const during = sessions.fetched.length;
    sessions.answer(INBOX_FEED_URL, feed(ONE_UNREAD));
    await advance(19_000);
    expect([during, sessions.fetched.length, status()]).toStrictEqual([
      1,
      2,
      { kind: "ok", unreadCount: 1 },
    ]);
  });

  it("follows one redirect within the mailbox, and fails a redirect anywhere else other than sign-in without calling the profile signed out", async () => {
    const { advance, log, sessions, start, status } = await setup();
    const other = "https://mail.google.com/mail/u/1/feed/atom";
    sessions.answer(INBOX_FEED_URL, {
      kind: "redirected",
      location: other,
      status: 302,
    });
    sessions.answer(other, feed(TWO_UNREAD));
    await start();
    const followed = status();
    sessions.answer(other, {
      kind: "redirected",
      location: "https://mail.google.com/mail/u/2/feed/atom",
      status: 302,
    });
    await advance(30_000);
    expect([followed, status(), log.at("warn")]).toStrictEqual([
      { kind: "ok", unreadCount: 2 },
      { kind: "ok", unreadCount: 2 },
      ["The inbox feed could not be read"],
    ]);
  });

  it("drops what a read brings back for a profile removed while it was out", async () => {
    const { advance, arrived, inbox, profiles, sessions, start } =
      await setup();
    const work = profiles.createProfile("Work");
    const workId = work.ok ? work.value.id : "";
    sessions.answer(INBOX_FEED_URL, "silent", partitionOf(workId));
    await start();
    profiles.removeProfile(workId);
    sessions.answer(INBOX_FEED_URL, feed(TWO_UNREAD), partitionOf(workId));
    await advance(20_000);
    expect({
      arrived,
      followed: Object.keys(inbox.feeds()),
      statuses: profiles.state.profiles.map((profile) => profile.status),
    }).toStrictEqual({
      arrived: [],
      followed: [profiles.selected().id],
      statuses: [{ kind: "ok", unreadCount: 0 }],
    });
  });
});
