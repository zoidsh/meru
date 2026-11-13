import { useEffect, useMemo, useState } from "react";

import {
  besideAt,
  dropRect,
  STYLE_METRICS,
} from "../../../core/engines/layout.ts";
import type { Point, Rect } from "../../../core/records/rect.ts";
import { appById } from "../../../shared/apps.ts";
import { drag, dragPushes } from "../../../shared/channels/drag.ts";
import { stage } from "../../../shared/channels/stage.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import type { TabDragSurface } from "../../../shared/channels/surfaces.ts";
import type { Client } from "../../client.ts";
import { AppIcon } from "../apps/app-icon.tsx";

/** Where a tab let go at `point` would land: the part of the pane under it the zone takes, or nothing over the tab's own pane or no pane. */
export const tintAt = (
  panes: StageSnapshot["panes"],
  point: Point,
  tabId: string
): Rect | undefined => {
  for (const pane of panes) {
    const zone = besideAt(pane.rect, point);
    if (zone !== undefined) {
      return pane.tabId === tabId ? undefined : dropRect(pane.rect, zone);
    }
  }
  return undefined;
};

const GHOST_OFFSET = 12;

/** A sidebar row dragged over the panes: the row beside the pointer and a tint over where it would land. */
export const TabDrag = ({
  client,
  accent,
  appId,
  tabId,
  title,
}: {
  readonly client: Client<TabDragSurface>;
  /** The colour of the tint, the theme's primary when empty. */
  readonly accent: string;
  readonly appId: string;
  readonly tabId: string;
  readonly title: string;
}) => {
  // The panes cannot move while the overlay covers them, so they are read once.
  const snapshot = useMemo(() => {
    const read = client.sendSync(stage.snapshot, {});
    return read.ok ? read.value : undefined;
  }, [client]);
  const [point, setPoint] = useState<Point | undefined>();
  // Whichever page holds the pointer reports it: the chrome page through main while its implicit capture lasts, this page once it gets the pointer itself.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      setPoint({ x: event.clientX, y: event.clientY });
    };
    const release = (event: PointerEvent) => {
      client.send(drag.end, { x: event.clientX, y: event.clientY });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    const unsubscribe = client.on(dragPushes.pointer, setPoint);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      unsubscribe();
    };
  }, [client]);
  if (point === undefined || snapshot === undefined) {
    return null;
  }
  const zone = tintAt(snapshot.panes, point, tabId);
  const tint = accent === "" ? "var(--primary)" : accent;
  const app = appById(appId);
  const name = app?.name ?? appId;
  return (
    <div className="pointer-events-none fixed inset-0 cursor-grabbing">
      {zone === undefined ? null : (
        <div
          className="absolute border-2 border-(--tint) bg-(--tint)/15"
          data-tint=""
          style={{
            backgroundColor: `color-mix(in oklab, ${tint} 15%, transparent)`,
            borderColor: tint,
            borderRadius: STYLE_METRICS[snapshot.style].radius,
            height: zone.height,
            left: zone.x,
            top: zone.y,
            width: zone.width,
          }}
        />
      )}
      <div
        className="bg-background text-foreground absolute flex max-w-56 items-center gap-2 rounded-md border px-2 py-1.5 text-sm shadow-lg"
        data-ghost=""
        style={{ left: point.x + GHOST_OFFSET, top: point.y + GHOST_OFFSET }}
      >
        <AppIcon className="size-4 shrink-0" icon={app?.icon} />
        <span className="truncate">{title === "" ? name : title}</span>
      </div>
    </div>
  );
};
