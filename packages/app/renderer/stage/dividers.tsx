import type { CSSProperties, PointerEvent } from "react";

import { stage } from "../../shared/channels/stage.ts";
import type { RendererSurface } from "../../shared/channels/surfaces.ts";
import type { StageSnapshot } from "../../shared/stage.ts";
import type { Client } from "../client.ts";
import type { Store } from "../store.ts";
import { useStore } from "../store.ts";

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

export const Dividers = ({
  client,
  store,
}: {
  readonly client: Client<RendererSurface>;
  readonly store: Store<StageSnapshot | undefined>;
}) => {
  const dividers = useStore(store, (snapshot) => snapshot?.dividers);

  // On macOS the chrome page keeps the pointer it captured even over a pane, so its moves and release reach main alongside the overlay's; main takes whichever arrives.
  const begin = (splitId: string) => (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    client.send(stage.beginDrag, { splitId });
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      client.send(stage.dragTo, {
        buttons: event.buttons,
        x: event.clientX,
        y: event.clientY,
      });
    }
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    client.send(stage.endDrag, { x: event.clientX, y: event.clientY });
  };

  return (
    <div className="dividers">
      {dividers?.map((divider) => (
        <div
          className="divider"
          data-split-id={divider.splitId}
          key={divider.splitId}
          onPointerDown={begin(divider.splitId)}
          onPointerMove={move}
          onPointerUp={end}
          style={hitArea(divider)}
        >
          <div className="divider-line" style={line(divider)} />
        </div>
      ))}
    </div>
  );
};
