import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { profiles } from "../../../shared/channels/profiles.ts";
import { sidebar } from "../../../shared/channels/sidebar.ts";
import { stage } from "../../../shared/channels/stage.ts";
import {
  answer,
  groupOf,
  mountChrome,
  profileOf,
  stageOf,
  tabOf,
} from "../../testing.tsx";
import { Sidebar } from "./sidebar.tsx";

const mounted: (() => void)[] = [];

const PROFILES = {
  groups: [groupOf("g-mail", ["mail"]), groupOf("g-cal", ["calendar"])],
  profiles: [profileOf("personal")],
  newProfileRefusal: null,
  selectedProfileId: "personal",
  tabs: [
    tabOf("mail", "gmail", "personal", false),
    tabOf("calendar", "calendar"),
  ],
};

// happy-dom lays nothing out, so the sidebar is given the rect a 64px strip down a 600px window has.
const STRIP = {
  bottom: 600,
  height: 600,
  left: 0,
  right: 64,
  top: 0,
  width: 64,
  x: 0,
  y: 0,
};

// dnd-kit works through its own scheduler, a frame or a task behind each event.
const settle = async () => {
  await act(async () => {
    const until = performance.now() + 5;
    await vi.waitUntil(() => performance.now() >= until, { interval: 1 });
  });
};

const mount = () => {
  const page = mountChrome(<Sidebar />, [
    answer(profiles.snapshot, PROFILES),
    answer(sidebar.snapshot, { kind: "shown", size: "narrow", width: 64 }),
    answer(stage.snapshot, stageOf({ focusedPaneId: "pane-mail" })),
  ]);
  mounted.push(page.unmount);
  const nav = page.container.querySelector("nav");
  if (nav !== null) {
    nav.getBoundingClientRect = () => DOMRect.fromRect(STRIP);
  }
  const row = page.container.querySelector<HTMLElement>(
    "[data-tab-id=calendar] [role=tab]"
  );
  const pointer = async (type: string, x: number, y: number) => {
    const target = type === "pointerdown" ? row : document;
    act(() => {
      target?.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
          isPrimary: true,
          pointerId: 1,
          pointerType: "mouse",
        })
      );
    });
    await settle();
  };
  return { ...page, pointer };
};

describe("a sidebar row dragged to the sidebar's edge", () => {
  // dnd-kit waits on the document's animations when a drag ends, which happy-dom does not implement.
  beforeAll(() => {
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: () => [],
    });
  });

  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
  });

  it("hands the drag to the stage once the pointer leaves the sidebar, and takes it back when it returns", async () => {
    const { pointer, sentOn } = mount();
    await pointer("pointerdown", 30, 70);
    await pointer("pointermove", 40, 90);
    await pointer("pointermove", 300, 200);
    const out = {
      begun: sentOn(stage.beginDrag),
      moved: sentOn(stage.dragTo).at(-1),
    };
    await pointer("pointermove", 30, 200);
    expect({ ...out, cancelled: sentOn(stage.cancelDrag) }).toStrictEqual({
      begun: [{ kind: "tab", tabId: "calendar" }],
      cancelled: [{}],
      moved: { buttons: 1, x: 300, y: 200 },
    });
  });

  it("cancels the stage's drag when dnd-kit cancels it over the panes", async () => {
    const { pointer, sentOn } = mount();
    await pointer("pointerdown", 30, 70);
    await pointer("pointermove", 40, 90);
    await pointer("pointermove", 300, 200);
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
      );
    });
    await settle();
    expect([sentOn(stage.cancelDrag), sentOn(stage.endDrag)]).toStrictEqual([
      [{}],
      [],
    ]);
  });

  it("ends the stage's drag where the pointer last was over the panes when the button comes up", async () => {
    const { pointer, sentOn } = mount();
    await pointer("pointerdown", 30, 70);
    await pointer("pointermove", 40, 90);
    await pointer("pointermove", 300, 200);
    await pointer("pointerup", 300, 200);
    expect(sentOn(stage.endDrag)).toStrictEqual([{ x: 300, y: 200 }]);
  });
});
