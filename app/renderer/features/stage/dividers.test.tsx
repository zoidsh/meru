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
      global: { "appearance.style": style },
      profiles: {},
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

  it("draws the seam in the classic style", () => {
    const container = mount("classic");
    expect(container.querySelector(".divider > div")).not.toBeNull();
  });
});
