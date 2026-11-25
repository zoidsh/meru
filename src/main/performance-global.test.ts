import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { restorePerformanceGlobal } from "./performance-global.ts";

describe(restorePerformanceGlobal, () => {
  it("makes a performance global gone stale read perf_hooks' own again", () => {
    let assigned: unknown;
    let set = false;
    // The shape of Node's lazy global, its module read before perf_hooks had
    // its exports.
    const target = Object.defineProperty({}, "performance", {
      configurable: true,
      enumerable: true,
      get: () => (set ? assigned : undefined),
      set: (value: unknown) => {
        set = true;
        assigned = value;
      },
    }) as { performance?: unknown };

    restorePerformanceGlobal(target);

    expect(target.performance).toBe(performance);
  });
});
