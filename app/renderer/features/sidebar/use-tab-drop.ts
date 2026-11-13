import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
} from "@dnd-kit/react";
import { useState } from "react";

import type { TabRow } from "../../../core/engines/ordering.ts";
import { dropAction, zoneAt } from "../../../core/engines/sidebar.ts";
import type { DropTarget } from "../../../core/engines/sidebar.ts";
import { tabs } from "../../../shared/channels/profiles.ts";
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

const sameTarget = (a: DropTarget | undefined, b: DropTarget | undefined) =>
  a?.tabId === b?.tabId && a?.zone === b?.zone;

export interface TabDropHandlers {
  readonly onDragMove: (event: DragMoveEvent) => void;
  readonly onDragOver: (event: DragOverEvent) => void;
  readonly onDragEnd: (event: DragEndEvent) => void;
}

/** A row dragged across the sidebar: the drop target under the pointer, and dnd-kit's handlers, which on release move the row, take it out of its group or join it to another's, as `dropAction` decides over `rows`. */
export const useTabDrop = (): {
  readonly drop: DropTarget | undefined;
  readonly handlers: (rows: readonly TabRow[]) => TabDropHandlers;
} => {
  const client = useClient();
  const [drop, setDrop] = useState<DropTarget | undefined>();
  // dnd-kit hands a move the operation as it stood before it, with the pointer's new place beside it, and finds the row under the pointer only after, which it reports as a drag over.
  const mark = (target: DropTarget | undefined) => {
    setDrop((current) => (sameTarget(current, target) ? current : target));
  };
  const handlers = (rows: readonly TabRow[]): TabDropHandlers => ({
    onDragEnd: (event) => {
      const source = event.operation.source?.id;
      const target = targetOf(event.operation);
      setDrop(undefined);
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
      mark(targetOf(event.operation, event.to?.y));
    },
    onDragOver: (event) => {
      mark(targetOf(event.operation));
    },
  });
  return { drop, handlers };
};
