import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
} from "@dnd-kit/react";
import { useRef, useState } from "react";
import type { RefObject } from "react";

import type { TabRow } from "../../../core/engines/ordering.ts";
import { dropAction, zoneAt } from "../../../core/engines/sidebar.ts";
import type { DropTarget } from "../../../core/engines/sidebar.ts";
import type { Point } from "../../../core/records/rect.ts";
import { tabs } from "../../../shared/channels/profiles.ts";
import { stage } from "../../../shared/channels/stage.ts";
import { useClient } from "../../client-context.tsx";

const targetOf = (
  { target, position }: DragMoveEvent["operation"],
  y = position.current.y
): DropTarget | undefined => {
  const rect = target?.element?.getBoundingClientRect();
  return typeof target?.id === "string" && rect !== undefined
    ? { tabId: target.id, zone: zoneAt(rect.top, rect.bottom, y) }
    : undefined;
};

const within = (rect: DOMRect, { x, y }: Point) =>
  x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;

const sameTarget = (a: DropTarget | undefined, b: DropTarget | undefined) =>
  a?.tabId === b?.tabId && a?.zone === b?.zone;

interface TabDropHandlers {
  readonly onDragMove: (event: DragMoveEvent) => void;
  readonly onDragOver: (event: DragOverEvent) => void;
  readonly onDragEnd: (event: DragEndEvent) => void;
}

/** A row dragged across the sidebar: the drop target under the pointer, and dnd-kit's handlers, which on release move the row, take it out of its group or join it to another's, as `dropAction` decides over `rows`. Once the pointer leaves `area`, the drag is handed to the stage, which draws it over the panes and joins the tab to the pane it is let go on; back inside, it is the sidebar's again. */
export const useTabDrop = (): {
  readonly area: RefObject<HTMLElement | null>;
  readonly drop: DropTarget | undefined;
  readonly handlers: (rows: readonly TabRow[]) => TabDropHandlers;
} => {
  const client = useClient();
  const area = useRef<HTMLElement>(null);
  const handed = useRef<string | undefined>(undefined);
  const [drop, setDrop] = useState<DropTarget | undefined>();
  // The panes are native views above this page, so a row cannot be drawn over them from here; the stage's overlay draws it, and this page only reports the pointer, which it keeps getting while the button is held.
  const follow = (source: unknown, point: Point | undefined): boolean => {
    const rect = area.current?.getBoundingClientRect();
    if (
      typeof source !== "string" ||
      point === undefined ||
      rect === undefined
    ) {
      return handed.current !== undefined;
    }
    if (!within(rect, point)) {
      if (handed.current !== source) {
        handed.current = source;
        client.send(stage.beginDrag, { kind: "tab", tabId: source });
      }
      client.send(stage.dragTo, { buttons: 1, ...point });
      return true;
    }
    if (handed.current !== undefined) {
      handed.current = undefined;
      client.send(stage.cancelDrag, {});
    }
    return false;
  };
  // dnd-kit hands a move the operation as it stood before it, with the pointer's new place beside it, and finds the row under the pointer only after, which it reports as a drag over.
  const mark = (target: DropTarget | undefined) => {
    setDrop((current) => (sameTarget(current, target) ? current : target));
  };
  const handlers = (rows: readonly TabRow[]): TabDropHandlers => ({
    onDragEnd: (event) => {
      const source = event.operation.source?.id;
      const target = targetOf(event.operation);
      setDrop(undefined);
      if (handed.current !== undefined) {
        handed.current = undefined;
        if (event.canceled) {
          client.send(stage.cancelDrag, {});
        } else {
          const { x, y } = event.operation.position.current;
          client.send(stage.endDrag, { x, y });
        }
        return;
      }
      if (
        event.canceled ||
        typeof source !== "string" ||
        target === undefined
      ) {
        return;
      }
      const action = dropAction(rows, source, target);
      if (action?.kind === "move") {
        void client.invoke(tabs.move, { tabId: source, to: action.to });
      } else if (action?.kind === "leave") {
        void client.invoke(tabs.leave, { tabId: source, to: action.to });
      } else if (action?.kind === "join") {
        // A drop onto a row says nothing of a side.
        void client.invoke(tabs.join, {
          orientation: "vertical",
          side: "after",
          tabId: source,
          targetTabId: action.targetTabId,
        });
      }
    },
    onDragMove: (event) => {
      if (follow(event.operation.source?.id, event.to)) {
        mark(undefined);
      } else {
        mark(targetOf(event.operation, event.to?.y));
      }
    },
    onDragOver: (event) => {
      mark(
        handed.current === undefined ? targetOf(event.operation) : undefined
      );
    },
  });
  return { area, drop, handlers };
};
