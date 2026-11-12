import type { CSSProperties } from "react";

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
  store,
}: {
  readonly client: Client<RendererSurface>;
  readonly store: Store<StageSnapshot | undefined>;
}) => {
  const dividers = useStore(store, (snapshot) => snapshot?.dividers);
  return (
    <div className="dividers">
      {dividers?.map((divider) => (
        <div
          className="divider"
          data-split-id={divider.splitId}
          key={divider.splitId}
          style={hitArea(divider)}
        >
          <div className="divider-line" style={line(divider)} />
        </div>
      ))}
    </div>
  );
};
