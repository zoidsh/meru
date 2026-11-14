import { describe, expect, it, vi } from "vitest";

import { DomScheduler } from "./scheduler.ts";

const row = (id: string) =>
  `<div data-legacy-thread-id="${id}"><span aria-label="Starred"></span></div>`;

const entry = {
  anchor: '[data-legacy-thread-id] [aria-label="Starred"]',
  hop: "[data-legacy-thread-id]",
  id: "row",
};

const frames = () => {
  const tasks: (() => void)[] = [];
  const run = () => {
    const pending = tasks.splice(0);
    for (const task of pending) {
      task();
    }
    return pending.length;
  };
  return {
    requestFrame: (task: () => void) => {
      tasks.push(task);
    },
    run,
    /** Waits for the page's changes to reach the scheduler, then runs the frames they asked for; the count is how many. */
    settle: async () => {
      await vi.waitFor(() => {
        expect(tasks.length).toBeGreaterThan(0);
      });
      return run();
    },
  };
};

const strictReport = (id: string): never => {
  throw new Error(`nothing should have been reported, got ${id}`);
};

describe(DomScheduler, () => {
  it("hands every element to its feature once, however often the page changes", async () => {
    document.body.innerHTML = row("a");
    const paint = frames();
    const seen: string[] = [];
    const scheduler = new DomScheduler({
      document,
      report: strictReport,
      requestFrame: paint.requestFrame,
    });

    scheduler.register(entry, (element) => {
      seen.push(element.dataset.legacyThreadId ?? "");
    });
    scheduler.start();
    paint.run();
    expect(seen).toStrictEqual(["a"]);

    document.body.insertAdjacentHTML("beforeend", row("b"));
    await paint.settle();
    expect(seen).toStrictEqual(["a", "b"]);

    document.body.insertAdjacentHTML("beforeend", "<p></p>");
    await paint.settle();
    expect(seen).toStrictEqual(["a", "b"]);
    scheduler.dispose();
  });

  it("folds what the page did into one frame", async () => {
    document.body.innerHTML = "";
    const paint = frames();
    const scheduler = new DomScheduler({
      document,
      report: strictReport,
      requestFrame: paint.requestFrame,
    });
    scheduler.register(entry, () => {
      // only the frames are counted here
    });
    scheduler.start();
    paint.run();

    document.body.insertAdjacentHTML("beforeend", row("a"));
    document.body.insertAdjacentHTML("beforeend", row("b"));
    document.body.insertAdjacentHTML("beforeend", row("c"));

    await expect(paint.settle()).resolves.toBe(1);
    scheduler.dispose();
  });

  it("reports an entry that stops finding what its context says it must, once", async () => {
    document.body.innerHTML = '<div role="main"></div>';
    const paint = frames();
    const reported: string[] = [];
    let now = 0;
    const scheduler = new DomScheduler({
      document,
      grace: 1000,
      now: () => now,
      report: (id) => {
        reported.push(id);
      },
      requestFrame: paint.requestFrame,
    });

    scheduler.register({ ...entry, context: 'div[role="main"]' });
    scheduler.start();
    paint.run();
    expect(reported).toStrictEqual([]);

    now = 2000;
    document.body.insertAdjacentHTML("beforeend", "<p></p>");
    await paint.settle();
    document.body.insertAdjacentHTML("beforeend", "<p></p>");
    await paint.settle();

    expect(reported).toStrictEqual(["row"]);
    scheduler.dispose();
  });

  it("reports a miss on a page that stopped changing once the grace is out", () => {
    document.body.innerHTML = '<div role="main"></div>';
    const paint = frames();
    const reported: string[] = [];
    const timers: { delay: number; task: () => void }[] = [];
    let now = 0;
    const scheduler = new DomScheduler({
      document,
      grace: 1000,
      later: (delay, task) => {
        timers.push({ delay, task });
      },
      now: () => now,
      report: (id) => {
        reported.push(id);
      },
      requestFrame: paint.requestFrame,
    });
    scheduler.register({ ...entry, context: 'div[role="main"]' });
    scheduler.start();
    paint.run();
    now = 400;
    paint.run();
    expect(timers.map(({ delay }) => delay)).toStrictEqual([1000]);
    now = 1000;
    timers[0]?.task();
    paint.run();
    expect(reported).toStrictEqual(["row"]);
    scheduler.dispose();
  });

  it("runs over the page's own observer and animation frames", async () => {
    document.body.innerHTML = "";
    const seen: string[] = [];
    const scheduler = new DomScheduler({ document, report: strictReport });
    scheduler.register(entry, (element) => {
      seen.push(element.dataset.legacyThreadId ?? "");
    });
    scheduler.start();

    document.body.insertAdjacentHTML("beforeend", row("a"));
    await vi.waitFor(() => {
      expect(seen).toStrictEqual(["a"]);
    });
    scheduler.dispose();
  });
});
