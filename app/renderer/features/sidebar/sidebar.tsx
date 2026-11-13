import { DragDropProvider } from "@dnd-kit/react";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
} from "@dnd-kit/react";
import { cn } from "cn";
import { ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { STYLE_METRICS } from "../../../core/engines/layout.ts";
import { orderedTabs, rowTabs } from "../../../core/engines/ordering.ts";
import type { TabRow } from "../../../core/engines/ordering.ts";
import {
  activeTabId,
  dropAction,
  showsGmailUnread,
  zoneAt,
} from "../../../core/engines/sidebar.ts";
import type { DropTarget } from "../../../core/engines/sidebar.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { commands } from "../../../shared/channels/commands.ts";
import { tabs as tabChannels } from "../../../shared/channels/profiles.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../client-context.tsx";
import { Button } from "../../ui/button.tsx";
import { useTooltip } from "../commands/use-tooltip.ts";
import { useProfiles } from "../profiles/use-profiles.ts";
import { useSetting } from "../settings/use-setting.ts";
import { useStage } from "../stage/use-stage.ts";
import { TabRowButton } from "./tab-row.tsx";
import type { GmailMark } from "./tab-row.tsx";
import { useSidebar } from "./use-sidebar.ts";

type Size = "narrow" | "wide";

/** The row radius each size draws at, which a group's outline adds its padding to so the two curves stay parallel. */
const ROW_RADIUS: Readonly<Record<Size, string>> = {
  narrow: "var(--radius-lg)",
  wide: "min(var(--radius-md), 12px)",
};

const OUTLINE_PADDING = 2;

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

const STEPS: Readonly<
  Record<string, (index: number, count: number) => number>
> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  End: (_index, count) => count - 1,
  Home: () => 0,
};

const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
  const step = STEPS[event.key];
  if (step === undefined) {
    return;
  }
  const tabs = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("[role=tab]"),
  ];
  const index =
    event.target instanceof HTMLElement ? tabs.indexOf(event.target) : -1;
  if (index === -1) {
    return;
  }
  event.preventDefault();
  tabs[step(index, tabs.length)]?.focus();
};

const WidthToggle = ({ size }: { readonly size: Size }) => {
  const client = useClient();
  const wide = size === "wide";
  const title = useTooltip(
    wide ? msg`Narrow the sidebar` : msg`Widen the sidebar`,
    "sidebar.toggleWidth"
  );
  return (
    <Button
      className={cn("text-muted-foreground", wide && "self-end")}
      data-width-toggle=""
      onClick={() => {
        void client.invoke(commands.run, { id: "sidebar.toggleWidth" });
      }}
      size="icon"
      tabIndex={-1}
      title={title}
      variant="ghost"
    >
      {wide ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
    </Button>
  );
};

/** The sidebar, the selected profile's tabs down the left of the window, shown while it has more than one; `launcher` goes at its foot. */
export const Sidebar = ({
  launcher,
}: {
  readonly launcher?: (size: Size) => ReactNode;
}) => {
  const client = useClient();
  const sidebar = useSidebar();
  const snapshot = useProfiles();
  const stageSnapshot = useStage();
  const showWidthToggle = useSetting("sidebar.showWidthToggle");
  const gmailBadge = useSetting("sidebar.gmailUnreadBadge");
  const unreadBadge = useSetting("profiles.unreadBadge");
  const { seams } = STYLE_METRICS[useSetting("appearance.style")];
  const [drop, setDrop] = useState<DropTarget | undefined>();
  if (sidebar.kind === "hidden" || snapshot === undefined) {
    return null;
  }
  const { size, width } = sidebar;
  const wide = size === "wide";
  const rows = orderedTabs(
    snapshot.tabs,
    snapshot.groups,
    snapshot.selectedProfileId
  );
  const profile = snapshot.profiles.find(
    (found) => found.id === snapshot.selectedProfileId
  );
  const active = activeTabId(
    snapshot.groups,
    stageSnapshot?.focusedPaneId ?? null
  );
  const gmailActive =
    active !== undefined &&
    snapshot.tabs.some((tab) => tab.id === active && tab.appId === "gmail");
  const gmail: GmailMark = {
    needsSignIn: profile?.status.kind === "needsSignIn",
    unread: showsGmailUnread({ gmailActive, mode: gmailBadge, unreadBadge })
      ? (profile?.status.unreadCount ?? null)
      : null,
  };
  const closeable = new Set(
    snapshot.tabs.filter((tab) => tab.closeable).map((tab) => tab.id)
  );
  const focusable = active ?? rows.flatMap(rowTabs)[0]?.id;
  // dnd-kit hands a move the operation as it stood before it, with the pointer's new place beside it, and finds the row under the pointer only after, which it reports as a drag over.
  const mark = (target: DropTarget | undefined) => {
    setDrop((current) => (sameTarget(current, target) ? current : target));
  };
  const move = (event: DragMoveEvent) => {
    mark(targetOf(event.operation, event.to?.y));
  };
  const over = (event: DragOverEvent) => {
    mark(targetOf(event.operation));
  };
  const end = (event: DragEndEvent) => {
    const source = event.operation.source?.id;
    const target = targetOf(event.operation);
    setDrop(undefined);
    if (event.canceled || typeof source !== "string" || target === undefined) {
      return;
    }
    const action = dropAction(rows, source, target);
    if (action?.kind === "move") {
      void client.invoke(tabChannels.move, { tabId: source, to: action.to });
    } else if (action?.kind === "leave") {
      void client.invoke(tabChannels.leave, { tabId: source, to: action.to });
    } else if (action?.kind === "join") {
      void client.invoke(tabChannels.join, {
        tabId: source,
        targetTabId: action.targetTabId,
      });
    }
  };
  const rowOf = (tab: Tab) => (
    <TabRowButton
      active={tab.id === active}
      closeable={closeable.has(tab.id)}
      drop={drop?.tabId === tab.id ? drop : undefined}
      focusable={tab.id === focusable}
      gmail={tab.appId === "gmail" ? gmail : undefined}
      key={tab.id}
      size={size}
      tab={tab}
    />
  );
  const drawRow = (row: TabRow) =>
    row.kind === "tab" ? (
      rowOf(row.tab)
    ) : (
      <div
        className={cn(
          "border-foreground/35 flex flex-col border-[1.5px] border-dashed",
          wide ? "gap-1" : "items-center gap-2"
        )}
        data-group-id={row.group.id}
        key={row.group.id}
        style={{
          borderRadius: `calc(${ROW_RADIUS[size]} + ${OUTLINE_PADDING}px)`,
          padding: OUTLINE_PADDING,
        }}
      >
        {rowTabs(row).map(rowOf)}
      </div>
    );
  return (
    <nav
      className={cn(
        "bg-background flex shrink-0 flex-col overflow-hidden p-3 select-none motion-safe:transition-[width] motion-safe:duration-200",
        seams && "border-r",
        wide ? "gap-1" : "items-center gap-2"
      )}
      data-sidebar={size}
      style={{ width }}
    >
      <DragDropProvider onDragEnd={end} onDragMove={move} onDragOver={over}>
        <div
          aria-orientation="vertical"
          className={cn(
            "flex min-h-0 w-full scrollbar-none flex-col overflow-y-auto",
            wide ? "gap-1" : "items-center gap-2"
          )}
          onKeyDown={moveFocus}
          role="tablist"
          tabIndex={-1}
        >
          {rows.map(drawRow)}
        </div>
      </DragDropProvider>
      <div
        className={cn(
          "mt-auto flex w-full flex-col pt-2",
          wide ? "gap-1" : "items-center gap-2"
        )}
      >
        {launcher?.(size)}
        {showWidthToggle ? <WidthToggle size={size} /> : null}
      </div>
    </nav>
  );
};
