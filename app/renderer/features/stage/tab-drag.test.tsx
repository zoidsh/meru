import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { wireName } from "../../../shared/channels/define.ts";
import { drag, dragPushes } from "../../../shared/channels/drag.ts";
import { stage } from "../../../shared/channels/stage.ts";
import { tabDragSurface } from "../../../shared/channels/surfaces.ts";
import { FakeBridge } from "../../../test/fakes/bridge.ts";
import { createClient } from "../../client.ts";
import { stageOf } from "../../testing.tsx";
import { TabDrag } from "./tab-drag.tsx";

const LEFT = { height: 400, width: 300, x: 0, y: 0 };
const RIGHT = { height: 400, width: 300, x: 300, y: 0 };

const PANES = [
  { paneId: "p1", rect: LEFT, tabId: "mail" },
  { paneId: "p2", rect: RIGHT, tabId: "calendar" },
];

const mounted: (() => void)[] = [];

const mount = () => {
  const bridge = new FakeBridge();
  bridge.answers.set(wireName(stage.snapshot), {
    ok: true,
    value: stageOf({ panes: PANES }),
  });
  const client = createClient({ meru: bridge }, tabDragSurface);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <TabDrag accent="#3e63dd" appId="drive" client={client} tabId="drive-1" />
    );
  });
  mounted.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  const point = (x: number, y: number) => {
    act(() => {
      bridge.emit(wireName(dragPushes.pointer), { x, y });
    });
  };
  const dropped = () => {
    const found = container.querySelector<HTMLElement>("[data-drop]");
    return found === null
      ? undefined
      : {
          height: found.style.height,
          left: found.style.left,
          width: found.style.width,
        };
  };
  return { bridge, container, point, dropped };
};

describe(TabDrag, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
  });

  it("draws nothing until it hears where the pointer is", () => {
    const { container } = mount();
    expect(container.childElementCount).toBe(0);
  });

  it("follows the pointer main reports, drawing the row beside it and the part of the pane it would take", () => {
    const { container, point, dropped } = mount();
    point(20, 200);
    expect({
      ghost: container.querySelector("[data-ghost]")?.textContent,
      drop: dropped(),
    }).toStrictEqual({
      ghost: "Drive",
      drop: { height: "400px", left: "0px", width: "150px" },
    });
    point(450, 200);
    expect(dropped()).toStrictEqual({
      height: "400px",
      left: "300px",
      width: "300px",
    });
  });

  it("reports a release it sees itself as the end of the drag", () => {
    const { bridge } = mount();
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", { clientX: 40, clientY: 60 })
      );
    });
    expect(
      bridge.sent.filter((sent) => sent.channel === wireName(drag.end))
    ).toStrictEqual([
      { channel: wireName(drag.end), payload: { x: 40, y: 60 } },
    ]);
  });
});
