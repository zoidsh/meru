import { describe, expect, it } from "vitest";

import { retryDelay, showsView, transition } from "./tab-machine.ts";
import type { TabEvent, TabStatus } from "./tab-machine.ts";

const refused = { code: -102, name: "ERR_CONNECTION_REFUSED" };

const EVENTS: TabEvent[] = [
  { kind: "select" },
  { kind: "loaded" },
  { kind: "failed-to-load", reason: refused },
  { kind: "crashed", reason: "killed" },
  { kind: "retry" },
  { kind: "reload" },
  { kind: "retry-due" },
  { kind: "online" },
  { kind: "navigate" },
];

const waiting = (attempt = 0): Extract<TabStatus, { kind: "failed" }> => ({
  kind: "failed",
  reason: refused,
  attempt,
  retrying: false,
});

const retrying = (attempt = 0): TabStatus => ({
  ...waiting(attempt),
  retrying: true,
});

const LOAD = { kind: "load" };

const RELOAD = { kind: "reload" };

/** Each status against each event: the expected status and effects. */
const TABLE: [TabStatus, Record<TabEvent["kind"], [TabStatus, unknown[]]>][] = [
  [
    { kind: "unloaded" },
    {
      select: [{ kind: "loading" }, [LOAD]],
      loaded: [{ kind: "unloaded" }, []],
      "failed-to-load": [{ kind: "unloaded" }, []],
      crashed: [{ kind: "unloaded" }, []],
      retry: [{ kind: "unloaded" }, []],
      reload: [{ kind: "unloaded" }, []],
      "retry-due": [{ kind: "unloaded" }, []],
      online: [{ kind: "unloaded" }, []],
      // Its URL is loaded when it is first selected.
      navigate: [{ kind: "unloaded" }, []],
    },
  ],
  [
    { kind: "loading" },
    {
      select: [{ kind: "loading" }, []],
      loaded: [{ kind: "live" }, []],
      "failed-to-load": [waiting(0), [{ kind: "schedule-retry", delay: 1000 }]],
      crashed: [{ kind: "crashed", reason: "killed" }, []],
      retry: [{ kind: "loading" }, []],
      reload: [{ kind: "loading" }, [RELOAD]],
      "retry-due": [{ kind: "loading" }, []],
      online: [{ kind: "loading" }, []],
      navigate: [{ kind: "loading" }, [LOAD]],
    },
  ],
  [
    { kind: "live" },
    {
      select: [{ kind: "live" }, []],
      loaded: [{ kind: "live" }, []],
      "failed-to-load": [waiting(0), [{ kind: "schedule-retry", delay: 1000 }]],
      crashed: [{ kind: "crashed", reason: "killed" }, []],
      retry: [{ kind: "live" }, []],
      reload: [{ kind: "loading" }, [RELOAD]],
      "retry-due": [{ kind: "live" }, []],
      online: [{ kind: "live" }, []],
      navigate: [{ kind: "live" }, [LOAD]],
    },
  ],
  [
    waiting(2),
    {
      // Selecting a failed tab waits for its retry, as it shows why.
      select: [waiting(2), []],
      // The error page that follows a failure.
      loaded: [waiting(2), []],
      "failed-to-load": [waiting(2), []],
      crashed: [{ kind: "crashed", reason: "killed" }, []],
      retry: [retrying(2), [LOAD]],
      reload: [retrying(2), [LOAD]],
      "retry-due": [retrying(2), [LOAD]],
      online: [retrying(2), [LOAD]],
      navigate: [retrying(2), [LOAD]],
    },
  ],
  [
    retrying(2),
    {
      select: [retrying(2), []],
      loaded: [{ kind: "live" }, []],
      "failed-to-load": [waiting(3), [{ kind: "schedule-retry", delay: 8000 }]],
      crashed: [{ kind: "crashed", reason: "killed" }, []],
      retry: [retrying(2), []],
      reload: [retrying(2), [LOAD]],
      "retry-due": [retrying(2), []],
      online: [retrying(2), []],
      navigate: [retrying(2), [LOAD]],
    },
  ],
  [
    { kind: "crashed", reason: "oom" },
    {
      select: [{ kind: "loading" }, [LOAD]],
      loaded: [{ kind: "crashed", reason: "oom" }, []],
      "failed-to-load": [{ kind: "crashed", reason: "oom" }, []],
      crashed: [{ kind: "crashed", reason: "oom" }, []],
      retry: [{ kind: "loading" }, [LOAD]],
      reload: [{ kind: "loading" }, [LOAD]],
      "retry-due": [{ kind: "crashed", reason: "oom" }, []],
      online: [{ kind: "crashed", reason: "oom" }, []],
      navigate: [{ kind: "loading" }, [LOAD]],
    },
  ],
];

describe(transition, () => {
  const cases = TABLE.flatMap(([status, expected]) =>
    EVENTS.map((event) => ({
      name:
        status.kind === "failed"
          ? `failed${status.retrying ? ", retrying" : ""}`
          : status.kind,
      status,
      event,
      expected: expected[event.kind],
    }))
  );

  it.each(cases)(
    "$name on $event.kind",
    ({ status, event, expected: [next, effects] }) => {
      expect(transition(status, event)).toStrictEqual({
        status: next,
        effects,
      });
    }
  );

  it("backs off from a second, doubling, to half a minute", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(retryDelay)).toStrictEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it("counts every failed retry towards the backoff", () => {
    let status: TabStatus = { kind: "loading" };
    const delays: number[] = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = transition(status, {
        kind: "failed-to-load",
        reason: refused,
      });

      for (const effect of failed.effects) {
        if (effect.kind === "schedule-retry") {
          delays.push(effect.delay);
        }
      }

      ({ status } = transition(failed.status, { kind: "retry-due" }));
    }

    expect(delays).toStrictEqual([1000, 2000, 4000, 8000]);
  });
});

describe(showsView, () => {
  it("shows the view while loading or live, and hides it while failed or crashed", () => {
    expect(
      [
        { kind: "unloaded" },
        { kind: "loading" },
        { kind: "live" },
        waiting(),
        retrying(),
        { kind: "crashed", reason: "killed" },
      ].map((status) => showsView(status as TabStatus))
    ).toStrictEqual([false, true, true, false, false, false]);
  });
});
