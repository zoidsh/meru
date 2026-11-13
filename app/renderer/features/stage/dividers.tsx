import type { CSSProperties, PointerEvent } from "react";

import { STYLE_METRICS } from "../../../core/engines/layout.ts";
import { stage } from "../../../shared/channels/stage.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import { useClient } from "../../client-context.tsx";
import { useSetting } from "../settings/use-setting.ts";
import { useStage } from "./use-stage.ts";

type Divider = StageSnapshot["dividers"][number];

const HIT = 6;

const hitArea = ({ rect, orientation }: Divider): CSSProperties =>
  orientation === "vertical"
    ? {
        cursor: "col-resize",
        height: rect.height,
        left: rect.x + rect.width / 2 - HIT / 2,
        top: rect.y,
        width: HIT,
      }
    : {
        cursor: "row-resize",
        height: HIT,
        left: rect.x,
        top: rect.y + rect.height / 2 - HIT / 2,
        width: rect.width,
      };

const line = ({ orientation }: Divider): CSSProperties =>
  orientation === "vertical"
    ? { height: "100%", left: HIT / 2 - 0.5, width: 1 }
    : { height: 1, top: HIT / 2 - 0.5, width: "100%" };

export const Dividers = () => {
  const client = useClient();
  const dividers = useStage()?.dividers;
  const { seams } = STYLE_METRICS[useSetting("appearance.style")];

  // The page keeps getting the pointer over a pane while the button is held on macOS and Linux, so it reports moves and the release alongside the overlay and main takes whichever arrives. They are followed on the window as well as captured, because on Linux the capture did not hold once the overlay appeared.
  const begin = (splitId: string) => (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    client.send(stage.beginDrag, { kind: "divider", splitId });
    const move = (moved: globalThis.PointerEvent) => {
      client.send(stage.dragTo, {
        buttons: moved.buttons,
        x: moved.clientX,
        y: moved.clientY,
      });
    };
    const end = (released: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      client.send(stage.endDrag, { x: released.clientX, y: released.clientY });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    event.preventDefault();
  };

  return (
    <div className="dividers">
      {dividers?.map((divider) => (
        <div
          className="divider absolute touch-none"
          data-split-id={divider.splitId}
          key={divider.splitId}
          onPointerDown={begin(divider.splitId)}
          style={hitArea(divider)}
        >
          {seams && (
            <div className="bg-foreground/20 absolute" style={line(divider)} />
          )}
        </div>
      ))}
    </div>
  );
};
