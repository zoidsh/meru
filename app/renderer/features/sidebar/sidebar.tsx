import { DragDropProvider, useDraggable } from "@dnd-kit/react";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/react";
import { cn } from "cn";
import {
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleAlertIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { panes } from "../../../core/engines/layout.ts";
import { orderedTabs, rowTabs } from "../../../core/engines/ordering.ts";
import type { TabRow } from "../../../core/engines/ordering.ts";
import {
  dropAction,
  showsGmailUnread,
  zoneAt,
} from "../../../core/engines/sidebar.ts";
import type { DropTarget } from "../../../core/engines/sidebar.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { appById } from "../../../shared/apps.ts";
import { commands } from "../../../shared/channels/commands.ts";
import { tabs as tabChannels } from "../../../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../../../shared/channels/profiles.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../chrome-context.tsx";
import { Button } from "../../ui/button.tsx";
import { AppIcon } from "../apps/app-icon.tsx";
import { useTooltip } from "../commands/use-tooltip.ts";
import { UnreadBadge } from "../profiles/unread-badge.tsx";
import { useProfiles } from "../profiles/use-profiles.ts";
import { useSetting } from "../settings/use-setting.ts";
import { useStage } from "../stage/use-stage.ts";
import { useSidebar } from "./use-sidebar.ts";

type Size = "narrow" | "wide";

/** The row radius each size draws at, which a group's outline adds its padding to so the two curves stay parallel. */
const ROW_RADIUS: Readonly<Record<Size, string>> = {
  narrow: "var(--radius-lg)",
  wide: "min(var(--radius-md), 12px)",
};

const OUTLINE_PADDING = 2;

interface GmailMark {
  readonly needsSignIn: boolean;
  readonly unread: number | null;
}

const titleOf = (tab: Tab): string => {
  const name = appById(tab.appId)?.name ?? tab.appId;
  return tab.title === "" || tab.title === name
    ? name
    : msg`${tab.title} – ${name}`;
};

const GmailBadge = ({ needsSignIn, unread }: GmailMark) => {
  if (needsSignIn) {
    return (
      <CircleAlertIcon className="bg-background pointer-events-none absolute -top-1 -right-1 size-3.5 rounded-full text-yellow-400" />
    );
  }
  return unread === null || unread === 0 ? null : (
    <UnreadBadge
      className="pointer-events-none absolute -top-1 -right-1"
      count={unread}
    />
  );
};

const TabRowButton = ({
  tab,
  index,
  size,
  active,
  gmail,
  drop,
  register,
}: {
  readonly tab: Tab;
  readonly index: number;
  readonly size: Size;
  readonly active: boolean;
  readonly gmail: GmailMark | undefined;
  readonly drop: DropTarget | undefined;
  readonly register: (tabId: string, element: Element | null) => void;
}) => {
  const client = useClient();
  const { ref, isDragging } = useDraggable({ id: tab.id });
  const wide = size === "wide";
  return (
    <div
      className="relative"
      data-drop={drop?.zone}
      data-tab-id={tab.id}
      ref={(element) => {
        register(tab.id, element);
      }}
    >
      {drop?.zone === "before" ? (
        <div className="bg-primary absolute inset-x-0 -top-0.5 h-0.5 rounded-full" />
      ) : null}
      <Button
        className={cn(
          "touch-none transition-colors",
          wide && "w-full justify-start",
          isDragging && "opacity-50",
          drop?.zone === "onto" && "ring-primary/50 ring-2"
        )}
        data-active={active || undefined}
        data-index={index}
        onClick={() => {
          void client.invoke(tabChannels.focus, { tabId: tab.id });
        }}
        ref={ref}
        size={wide ? "sm" : "icon"}
        tabIndex={-1}
        title={titleOf(tab)}
        variant={active ? "secondary" : "ghost"}
      >
        <AppIcon appId={tab.appId} className="size-4" />
        {wide ? (
          <span className="min-w-0 flex-1 overflow-hidden mask-r-from-[calc(100%-1.5rem)] text-left whitespace-nowrap">
            {tab.title === "" ? titleOf(tab) : tab.title}
          </span>
        ) : null}
      </Button>
      {gmail === undefined ? null : <GmailBadge {...gmail} />}
      {drop?.zone === "after" ? (
        <div className="bg-primary absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full" />
      ) : null}
    </div>
  );
};

/** The tab whose pane has focus, which its row shows as the active one. */
const activeTabId = (
  snapshot: ProfilesSnapshot,
  focusedPaneId: string | null
): string | undefined => {
  for (const group of snapshot.groups) {
    const pane = panes(group.layout).find(
      (found) => found.paneId === focusedPaneId
    );
    if (pane !== undefined) {
      return pane.tabIds[0];
    }
  }
  return undefined;
};

const findTarget = (
  rows: ReadonlyMap<string, Element>,
  draggedId: string,
  point: { readonly x: number; readonly y: number }
): DropTarget | undefined => {
  for (const [tabId, element] of rows) {
    const rect = element.getBoundingClientRect();
    if (
      tabId !== draggedId &&
      point.y >= rect.top &&
      point.y <= rect.bottom &&
      point.x >= rect.left - rect.width &&
      point.x <= rect.right + rect.width
    ) {
      return { tabId, zone: zoneAt(rect.top, rect.bottom, point.y) };
    }
  }
  return undefined;
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

/** The strip of the selected profile's tabs down the left of the window, shown while it has more than one; `launcher` goes at its foot. */
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
  const elements = useRef(new Map<string, Element>());
  const [drop, setDrop] = useState<DropTarget | undefined>();
  // The provider may hold the handlers of the render a drag began in, so the release reads the target from a ref rather than that render's state.
  const dropRef = useRef<DropTarget | undefined>(undefined);
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
  const active = activeTabId(snapshot, stageSnapshot?.focusedPaneId ?? null);
  const gmailActive =
    active !== undefined &&
    snapshot.tabs.some((tab) => tab.id === active && tab.appId === "gmail");
  const gmail: GmailMark = {
    needsSignIn: profile?.status.kind === "needsSignIn",
    unread:
      unreadBadge && showsGmailUnread(gmailBadge, gmailActive)
        ? (profile?.status.unreadCount ?? null)
        : null,
  };
  const register = (tabId: string, element: Element | null) => {
    if (element === null) {
      elements.current.delete(tabId);
    } else {
      elements.current.set(tabId, element);
    }
  };
  const move = (event: DragMoveEvent) => {
    const source = event.operation.source?.id;
    const target =
      typeof source === "string"
        ? findTarget(elements.current, source, event.operation.position.current)
        : undefined;
    dropRef.current = target;
    setDrop(target);
  };
  const end = (event: DragEndEvent) => {
    const source = event.operation.source?.id;
    const target = dropRef.current;
    dropRef.current = undefined;
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
  const rowOf = (tab: Tab, index: number) => (
    <TabRowButton
      active={tab.id === active}
      drop={drop?.tabId === tab.id ? drop : undefined}
      gmail={tab.appId === "gmail" ? gmail : undefined}
      index={index}
      key={tab.id}
      register={register}
      size={size}
      tab={tab}
    />
  );
  const drawRow = (row: TabRow, index: number) =>
    row.kind === "tab" ? (
      rowOf(row.tab, index)
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
        {rowTabs(row).map((tab) => rowOf(tab, index))}
      </div>
    );
  return (
    <nav
      className={cn(
        "bg-background flex shrink-0 flex-col overflow-hidden border-r p-3 select-none motion-safe:transition-[width] motion-safe:duration-200",
        wide ? "gap-1" : "items-center gap-2"
      )}
      data-sidebar={size}
      style={{ width }}
    >
      <DragDropProvider onDragEnd={end} onDragMove={move}>
        <div
          className={cn(
            "flex min-h-0 w-full scrollbar-none flex-col overflow-y-auto",
            wide ? "gap-1" : "items-center gap-2"
          )}
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
        <div data-slot="bookmarks" />
        {showWidthToggle ? <WidthToggle size={size} /> : null}
      </div>
    </nav>
  );
};
