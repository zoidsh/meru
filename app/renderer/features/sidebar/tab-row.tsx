import { useDraggable } from "@dnd-kit/react";
import { cn } from "cn";
import { CircleAlertIcon } from "lucide-react";

import type { DropTarget, SidebarSize } from "../../../core/engines/sidebar.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { appById } from "../../../shared/apps.ts";
import { tabs as tabChannels } from "../../../shared/channels/profiles.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../chrome-context.tsx";
import { Button } from "../../ui/button.tsx";
import { AppIcon } from "../apps/app-icon.tsx";
import { UnreadBadge } from "../profiles/unread-badge.tsx";

export interface GmailMark {
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

/** One tab's row in the strip: its icon, its title when wide, and Gmail's marks. */
export const TabRowButton = ({
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
  readonly size: SidebarSize;
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
        <AppIcon className="size-4" icon={appById(tab.appId)?.icon} />
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
