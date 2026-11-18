import { describe, expect, it } from "vitest";

import { followPointer } from "./follow-pointer.ts";

const pointer = (
  type: string,
  { pointerId = 1, buttons = 1, clientX = 0, clientY = 0 } = {}
) => Object.assign(new Event(type), { pointerId, buttons, clientX, clientY });

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
  it("passes on its pointer's moves and release, and no other pointer's", () => {
    const { target, heard } = follow();

    target.dispatchEvent(pointer("pointermove", { clientX: 4 }));
    target.dispatchEvent(pointer("pointermove", { pointerId: 2, clientX: 9 }));
    target.dispatchEvent(pointer("pointerup", { buttons: 0, clientX: 6 }));

    expect(heard).toStrictEqual(["move 4", "up 6"]);
  });

  it("keeps the drag through moves with no button held from one place, however long the held moves take to come", () => {
    const { target, heard } = follow();

    target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 640 }));
    target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 640 }));
    target.dispatchEvent(pointer("pointermove", { clientX: 8 }));
    target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 640 }));
    target.dispatchEvent(pointer("pointermove", { clientX: 9 }));
    target.dispatchEvent(pointer("pointerup", { buttons: 0, clientX: 9 }));

    expect(heard).toStrictEqual(["move 8", "move 9", "up 9"]);
  });

  it("counts the release as lost once moves with no button held come from a second place", () => {
    const { target, heard } = follow();

    target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 30 }));

    expect(heard).toStrictEqual([]);

    target.dispatchEvent(
      pointer("pointermove", { buttons: 0, clientX: 30, clientY: 2 })
    );

    expect(heard).toStrictEqual(["lost"]);
  });

  it("counts a cancel as lost and hears nothing once stopped", () => {
    const { target, heard, stop } = follow();

    target.dispatchEvent(pointer("pointercancel"));
    stop();
    target.dispatchEvent(pointer("pointermove"));
    target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 1 }));
    target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 2 }));

    expect(heard).toStrictEqual(["lost"]);
  });
});
