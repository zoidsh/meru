import { DragDropProvider, useDragDropManager } from "@dnd-kit/react";
import { cn } from "cn";
import { useEffect } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { STYLE_METRICS } from "../../../core/engines/layout.ts";
import { orderedTabs, rowTabs } from "../../../core/engines/ordering.ts";
import type { TabRow } from "../../../core/engines/ordering.ts";
import {
  activeTabId,
  showsGmailUnread,
} from "../../../core/engines/sidebar.ts";
import type { SidebarSize } from "../../../core/engines/sidebar.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { gmail as gmailApp, isSingleInstanceId } from "../../../shared/apps.ts";
import { stagePushes } from "../../../shared/channels/stage.ts";
import { useClient } from "../../client-context.tsx";
import { useProfiles, useSelectedProfile } from "../profiles/use-profiles.ts";
import { useSetting } from "../settings/use-setting.ts";
import { useStage } from "../stage/use-stage.ts";
import { TabRowButton } from "./tab-row.tsx";
import type { GmailMark } from "./tab-row.tsx";
import { useSidebar } from "./use-sidebar.ts";
import { useTabDrop } from "./use-tab-drop.ts";
import { WidthToggle } from "./width-toggle.tsx";

/** The row radius each size draws at, which a group's outline adds its padding to so the two curves stay parallel. */
const ROW_RADIUS: Readonly<Record<SidebarSize, string>> = {
  narrow: "var(--radius-lg)",
  wide: "min(var(--radius-md), 12px)",
};

const OUTLINE_PADDING = 2;

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

// The stage gives the drag's page over the panes the keyboard, so an Escape there ends the drag in main, and dnd-kit here has to be told.
const EndOnCancel = () => {
  const client = useClient();
  const manager = useDragDropManager();
  useEffect(
    () =>
      client.on(stagePushes.dragCancelled, () => {
        manager?.actions.stop({ canceled: true });
      }),
    [client, manager]
  );
  return null;
};

/** The sidebar, the selected profile's tabs down the left of the window, shown while it has more than one; `launcher` goes at its foot. */
export const Sidebar = ({
  launcher,
}: {
  readonly launcher?: (size: SidebarSize) => ReactNode;
}) => {
  const sidebar = useSidebar();
  const snapshot = useProfiles();
  const profile = useSelectedProfile();
  const stageSnapshot = useStage();
  const showWidthToggle = useSetting("sidebar.showWidthToggle");
  const gmailBadge = useSetting("sidebar.gmailUnreadBadge");
  const unreadBadge = useSetting("profiles.unreadBadge");
  const { seams } = STYLE_METRICS[useSetting("appearance.style")];
  const { area, drop, handlers } = useTabDrop();
  if (sidebar.kind === "hidden" || snapshot === undefined) {
    return null;
  }
  const { size, width } = sidebar;
  const wide = size === "wide";
  const rows = orderedTabs(
    snapshot.tabs,
    snapshot.groups,
    snapshot.selectedProfileId,
    isSingleInstanceId
  );
  const active = activeTabId(
    snapshot.groups,
    stageSnapshot?.focusedPaneId ?? null
  );
  const gmailActive =
    active !== undefined &&
    snapshot.tabs.some((tab) => tab.id === active && tab.appId === gmailApp.id);
  const gmail: GmailMark = {
    needsSignIn: profile?.status.kind === "needsSignIn",
    unread: showsGmailUnread({ gmailActive, mode: gmailBadge, unreadBadge })
      ? (profile?.status.unreadCount ?? null)
      : null,
  };
  const closeable = new Set(
    snapshot.tabs.filter((tab) => tab.closeable).map((tab) => tab.id)
  );
  const asleep = new Set(
    snapshot.tabs.filter((tab) => tab.asleep).map((tab) => tab.id)
  );
  const focusable = active ?? rows.flatMap(rowTabs)[0]?.id;
  const rowOf = (tab: Tab) => (
    <TabRowButton
      active={tab.id === active}
      asleep={asleep.has(tab.id)}
      closeable={closeable.has(tab.id)}
      drop={drop?.tabId === tab.id ? drop : undefined}
      focusable={tab.id === focusable}
      gmail={tab.appId === gmailApp.id ? gmail : undefined}
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
        "bg-chrome flex shrink-0 flex-col overflow-hidden p-3 select-none motion-safe:transition-[width] motion-safe:duration-200",
        seams && "border-r",
        wide ? "gap-1" : "items-center gap-2"
      )}
      data-sidebar={size}
      ref={area}
      style={{ width }}
    >
      <DragDropProvider {...handlers(rows)}>
        <EndOnCancel />
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
