import { describe, expect, it } from "vitest";

import { retryDelay, showsView, transition } from "./tab-machine.ts";
import type { TabEffect, TabEvent, TabStatus } from "./tab-machine.ts";

const refused = { code: -102, name: "ERR_CONNECTION_REFUSED" };
const FAILED: TabEvent = { kind: "failed-to-load", reason: refused };

/** Runs the events in turn from `status`: where it ends and what it ran. */
const run = (status: TabStatus, ...events: TabEvent[]) => {
  let current = status;
  const effects: TabEffect[] = [];

  for (const event of events) {
    const next = transition(current, event);

    current = next.status;
    effects.push(...next.effects);
  }

  return { status: current, effects };
};

describe(transition, () => {
  it("loads a restored tab only once it is selected", () => {
    expect(
      run({ kind: "unloaded" }, { kind: "reload" }, { kind: "online" })
    ).toStrictEqual({ status: { kind: "unloaded" }, effects: [] });
    expect(
      run({ kind: "unloaded" }, { kind: "select" }, { kind: "loaded" })
    ).toStrictEqual({ status: { kind: "live" }, effects: [{ kind: "load" }] });
  });

  it("reloads a live page where it is, and loads a new URL", () => {
    expect(run({ kind: "live" }, { kind: "reload" })).toStrictEqual({
      status: { kind: "loading" },
      effects: [{ kind: "reload" }],
    });
    expect(run({ kind: "live" }, { kind: "navigate" })).toStrictEqual({
      status: { kind: "live" },
      effects: [{ kind: "load" }],
    });
  });

  it("waits out a failure, even when selected or shown its error page, and retries on any of its four causes", () => {
    const failed = run({ kind: "loading" }, FAILED);

    expect(failed.effects).toStrictEqual([
      { kind: "schedule-retry", delay: 1000 },
    ]);
    expect(
      run(failed.status, { kind: "select" }, { kind: "loaded" }).effects
    ).toStrictEqual([]);

    for (const kind of ["retry", "retry-due", "online", "reload"] as const) {
      expect(run(failed.status, { kind })).toMatchObject({
        status: { kind: "failed", retrying: true },
        effects: [{ kind: "load" }],
      });
    }
  });

  it("goes live when a retry loads, and backs off further when it fails, counting every failed retry", () => {
    const retrying = run({ kind: "loading" }, FAILED, { kind: "retry-due" });

    expect(run(retrying.status, { kind: "loaded" }).status).toStrictEqual({
      kind: "live",
    });
    // A second retry asked for while one is under way changes nothing.
    expect(run(retrying.status, { kind: "retry" }).effects).toStrictEqual([]);

    const delays = run(
      { kind: "loading" },
      FAILED,
      { kind: "retry-due" },
      FAILED,
      { kind: "retry-due" },
      FAILED,
      { kind: "online" },
      FAILED
    ).effects.flatMap((effect) =>
      effect.kind === "schedule-retry" ? [effect.delay] : []
    );

    expect(delays).toStrictEqual([1000, 2000, 4000, 8000]);
  });

  it("holds a crash until the tab is selected, retried, reloaded or sent elsewhere, then loads it", () => {
    const crashed = run({ kind: "live" }, { kind: "crashed", reason: "oom" });

    expect(
      run(crashed.status, { kind: "online" }, { kind: "retry-due" })
    ).toStrictEqual({
      status: { kind: "crashed", reason: "oom" },
      effects: [],
    });

    for (const kind of ["select", "retry", "reload", "navigate"] as const) {
      expect(run(crashed.status, { kind })).toStrictEqual({
        status: { kind: "loading" },
        effects: [{ kind: "load" }],
      });
    }
  });

  it("backs off from a second, doubling, to half a minute", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(retryDelay)).toStrictEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });
});

describe(showsView, () => {
  it("shows the view while loading or live, and hides it while failed or crashed", () => {
    expect(
      [
        { kind: "unloaded" },
        { kind: "loading" },
        { kind: "live" },
        run({ kind: "loading" }, FAILED).status,
        { kind: "crashed", reason: "killed" },
      ].map((status) => showsView(status as TabStatus))
    ).toStrictEqual([false, true, true, false, false]);
  });
});
