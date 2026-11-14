import { setImmediate } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { GMAIL_URL, INBOX_FEED_URL } from "../../../core/engines/inbox.ts";
import { TWO_UNREAD } from "../../../core/fixtures/gmail-feeds.ts";
import { FakeBadge } from "../../../test/fakes/badge.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { strictLog } from "../../../test/fakes/log.ts";
import { FakeOnline } from "../../../test/fakes/online.ts";
import { FakePower } from "../../../test/fakes/power.ts";
import { PRO, testApp } from "../../testing.ts";
import { Inbox } from "../inbox/index.ts";
import { Badge } from "./index.ts";

const setup = async () => {
  const { clock, events, profiles, sessions, settings } = await testApp({
    clock: new FakeClock(Date.parse("2026-11-13T08:01:00Z")),
    entitlement: () => PRO,
  });
  sessions.answer(INBOX_FEED_URL, {
    kind: "answered",
    status: 200,
    text: TWO_UNREAD,
  });
  const inbox = new Inbox({
    clock,
    events,
    gmailUrl: GMAIL_URL,
    log: strictLog,
    online: new FakeOnline(true),
    power: new FakePower(),
    profiles,
    sessions,
    settings,
  });
  const port = new FakeBadge();
  const badge = new Badge({ badge: port, events, inbox, settings });
  badge.start();
  inbox.start();
  await setImmediate();
  return { badge, first: profiles.selected().id, port, settings };
};

describe(Badge, () => {
  it("shows the counted profiles' unread mail as the feed changes, leaves out a profile that is not counted, and shows nothing once the badge is off or gone", async () => {
    const { badge, first, port, settings } = await setup();
    const counted = port.total;
    settings.set("inbox.countUnread", false, first);
    const uncounted = port.total;
    settings.set("inbox.countUnread", true, first);
    const recounted = port.total;
    settings.set("inbox.unreadBadge", false);
    const off = port.total;
    settings.set("inbox.unreadBadge", true);
    badge.dispose();
    expect([counted, uncounted, recounted, off, port.total]).toStrictEqual([
      2, 0, 2, 0, 0,
    ]);
  });
});
