import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { settings } from "../../../shared/channels/settings.ts";
import { sidebar } from "../../../shared/channels/sidebar.ts";
import { stage } from "../../../shared/channels/stage.ts";
import { answer, mountChrome, stageOf } from "../../testing.tsx";
import { Dividers } from "./dividers.tsx";

const mounted: (() => void)[] = [];

const mount = (style: "modern" | "classic") => {
  const page = mountChrome(<Dividers />, [
    answer(sidebar.snapshot, { kind: "hidden" }),
    answer(settings.snapshot, {
      layers: {
        global: { "appearance.style": style },
        profiles: {},
      },
      locked: {},
    }),
    answer(stage.snapshot, {
      ...stageOf({ style }),
      dividers: [
        {
          orientation: "vertical",
          rect: { height: 500, width: 8, x: 400, y: 40 },
          splitId: "split",
        },
      ],
    }),
  ]);
  mounted.push(page.unmount);
  return page.container;
};

describe(Dividers, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
  });

  it("keeps the hit area but draws no line in the modern style", () => {
    const container = mount("modern");
    expect(container.querySelectorAll(".divider")).toHaveLength(1);
    expect(container.querySelector(".divider > div")).toBeNull();
  });

  it("cancels a divider's drag on Escape, sending no end once the button comes up", () => {
    const page = mountChrome(<Dividers />, [
      answer(sidebar.snapshot, { kind: "hidden" }),
      answer(stage.snapshot, {
        ...stageOf({ style: "modern" }),
        dividers: [
          {
            orientation: "vertical",
            rect: { height: 500, width: 8, x: 400, y: 40 },
            splitId: "split",
          },
        ],
      }),
    ]);
    mounted.push(page.unmount);
    const divider = page.container.querySelector<HTMLElement>(".divider");
    act(() => {
      divider?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 })
      );
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 5 }));
    });
    expect([
      page.sentOn(stage.beginDrag),
      page.sentOn(stage.cancelDrag),
      page.sentOn(stage.endDrag),
    ]).toStrictEqual([[{ kind: "divider", splitId: "split" }], [{}], []]);
  });

  it("draws the seam in the classic style", () => {
    const container = mount("classic");
    expect(container.querySelector(".divider > div")).not.toBeNull();
  });
});
