import { useEffect, useMemo, useState } from "react";

import { dropTargetAt, STYLE_METRICS } from "../../../core/engines/layout.ts";
import type { Point } from "../../../core/records/rect.ts";
import { appById } from "../../../shared/apps.ts";
import { drag, dragPushes } from "../../../shared/channels/drag.ts";
import { stage } from "../../../shared/channels/stage.ts";
import type { TabDragSurface } from "../../../shared/channels/surfaces.ts";
import type { Client } from "../../client.ts";
import { AppIcon } from "../apps/app-icon.tsx";

const GHOST_OFFSET = 12;

/** A sidebar row dragged over the panes: the row beside the pointer and, over the pane under it, the part the tab would take. */
export const TabDrag = ({
  client,
  accent,
  appId,
  tabId,
  title,
}: {
  readonly client: Client<TabDragSurface>;
  readonly accent?: string | undefined;
  readonly appId?: string | undefined;
  readonly tabId: string;
  readonly title?: string | undefined;
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
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        client.send(stage.cancelDrag, {});
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("keydown", cancel);
    const unsubscribe = client.on(dragPushes.pointer, setPoint);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("keydown", cancel);
      unsubscribe();
    };
  }, [client]);
  if (point === undefined || snapshot === undefined) {
    return null;
  }
  const zone = dropTargetAt(snapshot.panes, point, tabId)?.rect;
  const app = appId === undefined ? undefined : appById(appId);
  return (
    <div className="pointer-events-none fixed inset-0 cursor-grabbing">
      {zone === undefined ? null : (
        <div
          className="absolute border-2"
          data-drop=""
          style={{
            ...(accent === undefined
              ? {}
              : {
                  backgroundColor: `color-mix(in oklab, ${accent} 15%, transparent)`,
                  borderColor: accent,
                }),
            borderRadius: STYLE_METRICS[snapshot.style].radius,
            height: zone.height,
            left: zone.x,
            top: zone.y,
            width: zone.width,
          }}
        />
      )}
      <div
        className="bg-chrome text-chrome-foreground absolute flex max-w-56 items-center gap-2 rounded-md border px-2 py-1.5 text-sm shadow-lg"
        data-ghost=""
        style={{ left: point.x + GHOST_OFFSET, top: point.y + GHOST_OFFSET }}
      >
        <AppIcon className="size-4 shrink-0" icon={app?.icon} />
        <span className="truncate">{title ?? app?.name}</span>
      </div>
    </div>
  );
};
