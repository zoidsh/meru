import { describe, expect, it } from "vitest";

import {
  KEEP_ALIVE_TIMING,
  ROTATION_LIFETIME,
  dueKeepAlive,
  rotatedAt,
} from "./keep-alive.ts";
import type { KeepAliveFacts } from "./keep-alive.ts";

const NOW = Date.UTC(2026, 10, 18, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const { age, retry } = KEEP_ALIVE_TIMING;

const due = (facts: Partial<KeepAliveFacts>) =>
  dueKeepAlive(
    {
      profileIds: ["a"],
      rotated: new Map([["a", NOW - age]]),
      failed: new Map(),
      withViews: new Set(),
      signedOut: new Set(),
      online: true,
      running: false,
      now: NOW,
      ...facts,
    },
    KEEP_ALIVE_TIMING
  );

describe(dueKeepAlive, () => {
  it("is due once the cookie has gone two days unrotated, and not a moment before", () => {
    expect([
      due({}),
      due({ rotated: new Map([["a", NOW - age + 1]]) }),
    ]).toStrictEqual(["a", undefined]);
  });

  it("skips a profile with a view, one signed out, one never signed in, and every one offline", () => {
    expect([
      due({ withViews: new Set(["a"]) }),
      due({ signedOut: new Set(["a"]) }),
      due({ rotated: new Map() }),
      due({ online: false }),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });

  it("starts none while one runs", () => {
    expect(due({ running: true })).toBeUndefined();
  });

  it("tries a profile whose keep-alive did not rotate again an hour later", () => {
    expect([
      due({ failed: new Map([["a", NOW - retry + 1]]) }),
      due({ failed: new Map([["a", NOW - retry]]) }),
    ]).toStrictEqual([undefined, "a"]);
  });

  it("picks the stalest of those due", () => {
    expect(
      due({
        profileIds: ["a", "b", "c"],
        rotated: new Map([
          ["a", NOW - 3 * DAY],
          ["b", NOW - 9 * DAY],
          ["c", NOW - 5 * DAY],
        ]),
      })
    ).toBe("b");
  });

  it("catches up a week of sleep in the first check after it", () => {
    expect(due({ rotated: new Map([["a", NOW - 7 * DAY]]) })).toBe("a");
  });
});

describe(rotatedAt, () => {
  it("reads when the cookie rotated from its expiry, the latest of several", () => {
    expect([
      rotatedAt([NOW + ROTATION_LIFETIME]),
      rotatedAt([NOW + ROTATION_LIFETIME - HOUR, NOW + ROTATION_LIFETIME]),
      rotatedAt([]),
    ]).toStrictEqual([NOW, NOW, undefined]);
  });
});
