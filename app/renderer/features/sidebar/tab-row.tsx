import { useDraggable, useDroppable } from "@dnd-kit/react";
import { cn } from "cn";
import { CircleAlertIcon, XIcon } from "lucide-react";

import type { DropTarget, SidebarSize } from "../../../core/engines/sidebar.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { appById } from "../../../shared/apps.ts";
import { tabs as tabChannels } from "../../../shared/channels/profiles.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../client-context.tsx";
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

const GmailBadge = ({ mark }: { readonly mark: GmailMark | undefined }) => {
  if (mark === undefined) {
    return null;
  }
  const { needsSignIn, unread } = mark;
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

const DropLine = ({ at }: { readonly at: "before" | "after" }) => (
  <div
    className={cn(
      "bg-primary absolute inset-x-0 h-0.5 rounded-full",
      at === "before" ? "-top-0.5" : "-bottom-0.5"
    )}
  />
);

const CloseButton = ({
  wide,
  onClose,
}: {
  readonly wide: boolean;
  readonly onClose: () => void;
}) => (
  <Button
    className={cn(
      "absolute opacity-0 transition-colors group-hover:opacity-100 focus-visible:opacity-100",
      wide
        ? "inset-y-0 right-1 my-auto size-5"
        : "-top-1 -right-1 size-4 rounded-full"
    )}
    data-close=""
    onClick={onClose}
    size="icon"
    tabIndex={-1}
    title={msg`Close`}
    variant="secondary"
  >
    <XIcon className="size-3" />
  </Button>
);

/** One tab's row in the sidebar: its icon, its title when wide, Gmail's marks, and the close control hovering reveals. */
export const TabRowButton = ({
  tab,
  size,
  active,
  focusable,
  closeable,
  gmail,
  drop,
}: {
  readonly tab: Tab;
  readonly size: SidebarSize;
  readonly active: boolean;
  readonly focusable: boolean;
  readonly closeable: boolean;
  readonly gmail: GmailMark | undefined;
  readonly drop: DropTarget | undefined;
}) => {
  const client = useClient();
  const { ref, isDragging } = useDraggable({ id: tab.id });
  const { ref: dropRef } = useDroppable({ disabled: isDragging, id: tab.id });
  const wide = size === "wide";
  const close = () => {
    void client.invoke(tabChannels.close, { tabId: tab.id });
  };
  return (
    <div
      className="group relative"
      data-drop={drop?.zone}
      data-tab-id={tab.id}
      ref={dropRef}
    >
      {drop?.zone === "before" ? <DropLine at="before" /> : null}
      <Button
        aria-selected={active}
        className={cn(
          "touch-none transition-colors",
          wide && "w-full justify-start",
          wide && closeable && "group-hover:pr-7",
          isDragging && "opacity-50",
          drop?.zone === "onto" && "ring-primary/50 ring-2"
        )}
        data-active={active || undefined}
        onAuxClick={(event) => {
          if (event.button === 1 && closeable) {
            close();
          }
        }}
        onClick={() => {
          void client.invoke(tabChannels.focus, { tabId: tab.id });
        }}
        ref={ref}
        role="tab"
        size={wide ? "sm" : "icon"}
        tabIndex={focusable ? 0 : -1}
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
      <GmailBadge mark={gmail} />
      {closeable ? <CloseButton onClose={close} wide={wide} /> : null}
      {drop?.zone === "after" ? <DropLine at="after" /> : null}
    </div>
  );
};
