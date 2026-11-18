import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { followPointer } from "./follow-pointer.ts";

const pointer = (
  type: string,
  { pointerId = 1, buttons = 1, clientX = 0 } = {}
) => Object.assign(new Event(type), { pointerId, buttons, clientX });

const follow = () => {
  const target = new EventTarget();
  const heard: string[] = [];
  const stop = followPointer(target, 1, {
    move: (event) => heard.push(`move ${event.clientX}`),
    up: (event) => heard.push(`up ${event.clientX}`),
    lost: () => heard.push("lost"),
  });

  return { target, heard, stop };
};

describe(followPointer, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes on its pointer's moves and release, and no other pointer's", () => {
    const { target, heard } = follow();

    target.dispatchEvent(pointer("pointermove", { clientX: 4 }));
    target.dispatchEvent(pointer("pointermove", { pointerId: 2, clientX: 9 }));
    target.dispatchEvent(pointer("pointerup", { buttons: 0, clientX: 6 }));

    expect(heard).toStrictEqual(["move 4", "up 6"]);
  });

  it("keeps the drag through a move with no button held when one with a button follows soon", () => {
    const { target, heard } = follow();

    target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 640 }));
    vi.advanceTimersByTime(100);
    target.dispatchEvent(pointer("pointermove", { clientX: 8 }));
    vi.advanceTimersByTime(1000);

    expect(heard).toStrictEqual(["move 8"]);
  });

  it("counts the release as lost when only moves with no button held come", () => {
    const { target, heard } = follow();

    target.dispatchEvent(pointer("pointermove", { buttons: 0 }));
    vi.advanceTimersByTime(100);
    target.dispatchEvent(pointer("pointermove", { buttons: 0 }));

    expect(heard).toStrictEqual([]);

    vi.advanceTimersByTime(50);

    expect(heard).toStrictEqual(["lost"]);
  });

  it("takes a release after a move with no button held as the release", () => {
    const { target, heard } = follow();

    target.dispatchEvent(pointer("pointermove", { buttons: 0 }));
    target.dispatchEvent(pointer("pointerup", { buttons: 0, clientX: 3 }));
    vi.advanceTimersByTime(1000);

    expect(heard).toStrictEqual(["up 3"]);
  });

  it("counts a cancel as lost and hears nothing once stopped", () => {
    const { target, heard, stop } = follow();

    target.dispatchEvent(pointer("pointercancel"));
    stop();
    target.dispatchEvent(pointer("pointermove"));
    target.dispatchEvent(pointer("pointermove", { buttons: 0 }));
    vi.advanceTimersByTime(1000);

    expect(heard).toStrictEqual(["lost"]);
  });
});
