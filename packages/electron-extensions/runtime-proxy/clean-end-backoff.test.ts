import { describe, expect, test } from "bun:test";
import { createCleanEndBackoff } from "./clean-end-backoff";

describe("createCleanEndBackoff", () => {
  test("the first clean end waits for nothing, and the rest double to the ceiling", () => {
    const backoff = createCleanEndBackoff({ ceilingMs: 1000, windowMs: 1000 });

    const waits = Array.from({ length: 9 }, () => backoff.next(0));

    expect(waits).toEqual([0, 16, 32, 64, 128, 256, 512, 1000, 1000]);
  });

  test("a stream that lived out the window starts the doubling over", () => {
    const backoff = createCleanEndBackoff({ ceilingMs: 1000, windowMs: 1000 });

    backoff.next(0);

    backoff.next(0);

    expect(backoff.next(0)).toBe(32);

    // The one that lived pays nothing itself, and the one after it pays the
    // floor rather than the 64 the doubling had reached
    expect(backoff.next(1000)).toBe(0);

    expect(backoff.next(0)).toBe(16);
  });

  test("a reset forgets the flapping the way a failed stream does", () => {
    const backoff = createCleanEndBackoff({ ceilingMs: 1000 });

    backoff.next(0);

    backoff.next(0);

    backoff.reset();

    expect(backoff.next(0)).toBe(0);
  });

  test("a ceiling under the floor is the ceiling, not the floor", () => {
    const backoff = createCleanEndBackoff({ ceilingMs: 5, windowMs: 1000 });

    expect([backoff.next(0), backoff.next(0), backoff.next(0)]).toEqual([0, 5, 5]);
  });
});
