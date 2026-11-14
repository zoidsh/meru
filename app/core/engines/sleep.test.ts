import { describe, expect, it } from "vitest";

import { maySleep, sweep } from "./sleep.ts";
import type { SleepInput } from "./sleep.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const gmail = { appId: "gmail", id: "gmail", sleeps: true };
const drive = { appId: "drive", id: "drive", sleeps: true };
const docs = { appId: "docs", id: "docs", sleeps: true };
const calendar = { appId: "calendar", id: "calendar", sleeps: false };

const single = (appId: string) => appId === "gmail";

const input = (overrides: Partial<SleepInput> = {}): SleepInput => ({
  after: HOUR,
  asleep: new Set(),
  audible: new Set(),
  lastSeen: new Map(),
  now: 10 * HOUR,
  shown: new Set(),
  singleInstance: single,
  tabs: [gmail, drive, docs, calendar],
  ...overrides,
});

describe(maySleep, () => {
  it("lets a tab sleep only when the user let it and it is not pinned", () => {
    expect([
      maySleep(gmail, single),
      maySleep(drive, single),
      maySleep(calendar, single),
    ]).toStrictEqual([false, true, false]);
  });
});

describe(sweep, () => {
  it("puts to sleep a tab let sleep once it has been out of sight for the whole wait, and none other", () => {
    const now = 10 * HOUR;
    const plan = sweep(
      input({
        lastSeen: new Map([
          ["gmail", now - 2 * HOUR],
          ["drive", now - HOUR],
          ["docs", now - HOUR + MINUTE],
          ["calendar", now - 2 * HOUR],
        ]),
      })
    );
    expect(plan).toStrictEqual({
      asleep: new Set(["drive"]),
      fallAsleep: ["drive"],
      lastSeen: new Map([
        ["gmail", now - 2 * HOUR],
        ["drive", now - HOUR],
        ["docs", now - HOUR + MINUTE],
        ["calendar", now - 2 * HOUR],
      ]),
      next: now + MINUTE,
    });
  });

  it("keeps a shown or sounding tab awake and counts its wait from now", () => {
    const now = 10 * HOUR;
    const plan = sweep(
      input({
        audible: new Set(["docs"]),
        lastSeen: new Map([
          ["drive", now - 2 * HOUR],
          ["docs", now - 2 * HOUR],
        ]),
        shown: new Set(["drive"]),
        tabs: [drive, docs],
      })
    );
    expect(plan).toStrictEqual({
      asleep: new Set(),
      fallAsleep: [],
      lastSeen: new Map([
        ["drive", now],
        ["docs", now],
      ]),
      next: now + HOUR,
    });
  });

  it("wakes a sleeping tab once a pane shows it, and keeps one asleep while none does, without putting it to sleep again", () => {
    const now = 10 * HOUR;
    const plan = sweep(
      input({
        asleep: new Set(["drive", "docs"]),
        lastSeen: new Map([
          ["drive", now - 3 * HOUR],
          ["docs", now - 3 * HOUR],
        ]),
        shown: new Set(["drive"]),
        tabs: [drive, docs],
      })
    );
    expect([plan.asleep, plan.fallAsleep, plan.next]).toStrictEqual([
      new Set(["docs"]),
      [],
      null,
    ]);
  });

  it("starts the wait of a tab it has never seen at now, and asks for no sweep while nothing can sleep", () => {
    const now = 10 * HOUR;
    expect([
      sweep(input({ tabs: [drive] })).next,
      sweep(input({ tabs: [gmail, calendar] })).next,
      sweep(input({ shown: new Set(["drive"]), tabs: [drive] })).next,
    ]).toStrictEqual([now + HOUR, null, null]);
  });

  it("forgets a closed tab", () => {
    const plan = sweep(
      input({
        asleep: new Set(["closed"]),
        lastSeen: new Map([["closed", 0]]),
        tabs: [calendar],
      })
    );
    expect([plan.asleep, [...plan.lastSeen.keys()]]).toStrictEqual([
      new Set(),
      ["calendar"],
    ]);
  });
});
