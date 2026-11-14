import { cn } from "cn";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { TITLEBAR_HEIGHT } from "../../../core/engines/chrome.ts";
import { orderedProfiles } from "../../../core/engines/ordering.ts";
import { profiles as profileChannels } from "../../../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../../../shared/channels/profiles.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../client-context.tsx";
import { Button } from "../../ui/button.tsx";
import { UnreadBadge } from "../profiles/unread-badge.tsx";
import { useProfiles } from "../profiles/use-profiles.ts";
import { useSetting } from "../settings/use-setting.ts";
import { TitlebarIconButton } from "./titlebar-icon-button.tsx";

type ShownProfile = ProfilesSnapshot["profiles"][number];

const MINIMUM_SCROLL = 96;

interface RowScroll {
  readonly canScrollLeft: boolean;
  readonly canScrollRight: boolean;
}

const NONE: RowScroll = { canScrollLeft: false, canScrollRight: false };

const scrollOf = (row: HTMLElement): RowScroll => ({
  canScrollLeft: row.scrollLeft > 1,
  canScrollRight: row.scrollWidth - row.clientWidth - row.scrollLeft > 1,
});

const follow = (row: HTMLElement, update: () => void) => {
  const observer = new ResizeObserver(update);
  const observeAll = () => {
    observer.observe(row);
    for (const child of row.children) {
      observer.observe(child);
    }
    update();
  };
  observeAll();
  // A profile added or removed changes how far the row scrolls without resizing an element already observed.
  const children = new MutationObserver(observeAll);
  children.observe(row, { childList: true });
  // React attaches its wheel listener passively, and turning a vertical wheel into a horizontal scroll takes preventDefault.
  const wheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }
    row.scrollLeft += event.deltaY;
    event.preventDefault();
  };
  row.addEventListener("scroll", update);
  row.addEventListener("wheel", wheel, { passive: false });
  return () => {
    observer.disconnect();
    children.disconnect();
    row.removeEventListener("scroll", update);
    row.removeEventListener("wheel", wheel);
  };
};

/** Which way the row can still scroll, kept as its size, its contents and its scroll position change. */
const useRowScroll = (
  row: HTMLDivElement | null,
  selectedId: string | undefined
) => {
  const [scroll, setScroll] = useState<RowScroll>(NONE);

  useEffect(
    () =>
      row === null
        ? undefined
        : follow(row, () => {
            setScroll(scrollOf(row));
          }),
    [row]
  );

  // Keyed on the selection rather than the click, since a shortcut or the menu selects a profile without the row hearing of it.
  useEffect(() => {
    if (selectedId === undefined) {
      return;
    }
    row
      ?.querySelector(`[data-profile-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [row, selectedId]);

  const scrollBy = (direction: 1 | -1) => {
    row?.scrollBy({
      left: direction * Math.max(MINIMUM_SCROLL, row.clientWidth / 2),
    });
  };

  return { ...scroll, scrollBy };
};

const ProfileButton = ({
  profile,
  selected,
  unreadBadge,
}: {
  readonly profile: ShownProfile;
  readonly selected: boolean;
  readonly unreadBadge: boolean;
}) => {
  const client = useClient();
  const { status } = profile;
  const needsSignIn = status.kind === "needsSignIn";
  const unread = status.unreadCount ?? 0;
  return (
    <Button
      className="draggable-none"
      data-profile-id={profile.id}
      data-selected={selected || undefined}
      onClick={() => {
        void client.invoke(profileChannels.select, { profileId: profile.id });
      }}
      size="sm"
      tabIndex={-1}
      title={
        needsSignIn ? msg`${profile.label} needs you to sign in` : undefined
      }
      variant={selected ? "secondary" : "ghost"}
    >
      {profile.color === undefined ? undefined : (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: profile.color }}
        />
      )}
      {profile.label}
      {needsSignIn ? (
        <CircleAlertIcon className="text-yellow-400" />
      ) : undefined}
      {!needsSignIn && unreadBadge && unread > 0 ? (
        <UnreadBadge count={unread} />
      ) : undefined}
    </Button>
  );
};

/** A button per profile the entitlement allows, nothing while there is one; the row scrolls when they do not fit. */
export const ProfileRow = () => {
  const snapshot = useProfiles();
  const unreadBadge = useSetting("profiles.unreadBadge");
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const selectedId = snapshot?.selectedProfileId;
  const scroll = useRowScroll(row, selectedId);
  const shown = orderedProfiles(snapshot?.profiles ?? []).filter(
    (profile) => !profile.deactivated
  );
  if (shown.length <= 1) {
    return null;
  }
  const arrow =
    "absolute top-0 flex items-center bg-chrome duration-150 motion-safe:transition-opacity";
  return (
    <div
      className="relative flex min-w-0 flex-1 items-center"
      data-profile-row=""
    >
      {/* Not a drag region: macOS hands a drag region's wheel events to the window before the page sees them, which stopped a trackpad dead in the gaps between buttons. */}
      <div
        className="draggable-none flex min-w-0 flex-1 scrollbar-none items-center gap-1 overflow-x-auto overflow-y-hidden motion-safe:scroll-smooth"
        ref={setRow}
        style={{ height: TITLEBAR_HEIGHT }}
      >
        {shown.map((profile) => (
          <ProfileButton
            key={profile.id}
            profile={profile}
            selected={profile.id === selectedId}
            unreadBadge={unreadBadge}
          />
        ))}
        <div className="draggable h-full min-w-4 flex-1" />
      </div>
      <div
        className={cn(
          arrow,
          "left-0",
          !scroll.canScrollLeft && "pointer-events-none opacity-0"
        )}
        style={{ height: TITLEBAR_HEIGHT }}
      >
        <TitlebarIconButton
          aria-hidden={!scroll.canScrollLeft || undefined}
          className="text-muted-foreground"
          disabled={!scroll.canScrollLeft}
          onClick={() => {
            scroll.scrollBy(-1);
          }}
          title={msg`Scroll profiles left`}
        >
          <ChevronLeftIcon />
        </TitlebarIconButton>
      </div>
      <div
        className={cn(
          arrow,
          "right-0",
          !scroll.canScrollRight && "pointer-events-none opacity-0"
        )}
        style={{ height: TITLEBAR_HEIGHT }}
      >
        <TitlebarIconButton
          aria-hidden={!scroll.canScrollRight || undefined}
          className="text-muted-foreground"
          disabled={!scroll.canScrollRight}
          onClick={() => {
            scroll.scrollBy(1);
          }}
          title={msg`Scroll profiles right`}
        >
          <ChevronRightIcon />
        </TitlebarIconButton>
      </div>
    </div>
  );
};
