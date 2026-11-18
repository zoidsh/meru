import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MoonIcon,
  PanelLeftIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import { TITLEBAR_HEIGHT } from "#core/layout.ts";
import { selectProfileCommandId } from "#core/profile-shortcuts.ts";
import { Button } from "#ui/button.tsx";

import { isMenuKey, useMenuReturn, wholePoint } from "./context-menu.ts";
import { InboxButton } from "./inbox.tsx";
import { keepInViewBy } from "./keep-in-view.ts";
import { OpenAppTitlebarButton } from "./open-app.tsx";
import { useShortcutTitle } from "./shortcut-title.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { TitlebarButton } from "./titlebar-button.tsx";
import { UnreadBadge } from "./unread-badge.tsx";

type Shortcuts = ShellState["shortcuts"];

/** Shows the sidebar or hides it, pressed while it shows. */
const SidebarToggle = ({
  shown,
  shortcuts,
}: {
  shown: boolean;
  shortcuts: Shortcuts | undefined;
}) => {
  const { t } = useLingui();

  return (
    <TitlebarButton
      pressed={shown}
      label={t({
        message: "Sidebar",
        context: "title bar button",
        comment:
          "Accessible name of the title bar button that shows or hides the list of tabs down the left of the window, read by screen readers with whether it is pressed",
      })}
      tooltip={
        shown
          ? t({
              message: "Hide sidebar",
              comment:
                "Tooltip of the title bar button that hides the list of tabs down the left of the window",
            })
          : t({
              message: "Show sidebar",
              comment:
                "Tooltip of the title bar button that shows the list of tabs down the left of the window",
            })
      }
      shortcut={shortcuts?.["sidebar.toggle"]}
      onClick={() => {
        shellCalls().toggleSidebar({});
      }}
    >
      <PanelLeftIcon />
    </TitlebarButton>
  );
};

/**
 * Back, Forward and Reload on the front tab's page, none while there is no
 * page. Reload spins while the page loads, and is Stop then, which hovering
 * or focusing it shows.
 */
const NavigationButtons = ({
  shortcuts,
}: {
  shortcuts: Shortcuts | undefined;
}) => {
  const { t } = useLingui();
  const navigation = useShellState("navigation") ?? null;
  const tabs = useShellState("tabs");
  const inboxOpen = useShellState("inbox")?.open ?? false;
  const reloadWakes = (tabs?.selectedAsleep ?? false) && !inboxOpen;
  const loading = navigation?.loading ?? false;
  const reloadLabel = loading
    ? t({
        message: "Stop",
        comment:
          "Accessible name and tooltip of the title bar button that stops the page loading, shown in place of Reload while it loads",
      })
    : t({
        message: "Reload",
        comment:
          "Accessible name and tooltip of the title bar button that loads the page again",
      });

  return (
    <>
      <TitlebarButton
        label={t({
          message: "Back",
          comment:
            "Accessible name and tooltip of the title bar button that goes to the page the tab showed before",
        })}
        shortcut={shortcuts?.["tab.back"]}
        disabled={!navigation?.canGoBack}
        onClick={() => {
          shellCalls().navigate({ action: "back" });
        }}
      >
        <ArrowLeftIcon />
      </TitlebarButton>
      <TitlebarButton
        label={t({
          message: "Forward",
          comment:
            "Accessible name and tooltip of the title bar button that goes to the page the tab left by going back",
        })}
        shortcut={shortcuts?.["tab.forward"]}
        disabled={!navigation?.canGoForward}
        onClick={() => {
          shellCalls().navigate({ action: "forward" });
        }}
      >
        <ArrowRightIcon />
      </TitlebarButton>
      <TitlebarButton
        label={reloadLabel}
        shortcut={loading ? undefined : shortcuts?.["tab.reload"]}
        // Reload wakes a sleeping selected tab, which has no page.
        disabled={navigation === null && !reloadWakes}
        onClick={() => {
          shellCalls().navigate({ action: loading ? "stop" : "reload" });
        }}
      >
        {loading ? (
          <>
            <LoaderCircleIcon
              aria-hidden
              className="animate-spin group-hover/button:hidden group-focus-visible/button:hidden"
            />
            <XIcon
              aria-hidden
              className="hidden group-hover/button:block group-focus-visible/button:block"
            />
          </>
        ) : (
          <RotateCwIcon aria-hidden />
        )}
      </TitlebarButton>
    </>
  );
};

/** Which ends of the profile row are clipped, so their arrows show. */
const useClippedEnds = (scroller: HTMLElement | null) => {
  const [clipped, setClipped] = useState({ start: false, end: false });

  useEffect(() => {
    if (!scroller) {
      return;
    }

    const measure = () => {
      const { scrollLeft, scrollWidth, clientWidth } = scroller;

      setClipped({
        start: scrollLeft > 0.5,
        end: scrollLeft + clientWidth < scrollWidth - 0.5,
      });
    };
    const observer = new ResizeObserver(measure);

    observer.observe(scroller);

    for (const child of scroller.children) {
      observer.observe(child);
    }

    scroller.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, [scroller]);

  return clipped;
};

/** The selected profile scrolls clear of the fade over a clipped end, `w-10`. */
const keepClearOfFades = keepInViewBy(40);

/** Left and Right, Home and End, move focus within the row. */
const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
  const buttons = [
    ...(event.currentTarget
      .closest("fieldset")
      ?.querySelectorAll<HTMLElement>("[aria-pressed]") ?? []),
  ];
  const index = buttons.indexOf(event.currentTarget);
  const last = buttons.length - 1;
  const next = {
    ArrowLeft: Math.max(0, index - 1),
    ArrowRight: Math.min(last, index + 1),
    Home: 0,
    End: last,
  }[event.key];

  if (index !== -1 && next !== undefined) {
    event.preventDefault();
    buttons[next]?.focus();
  }
};

type ShellProfile = ShellState["profiles"]["profiles"][number];

/**
 * A profile button's accessible name and tooltip: its name, then "asleep" and
 * "sign in required" as they apply, and for the name its unread count.
 */
const useProfileLabels = (
  name: string,
  asleep: boolean,
  signedOut: boolean,
  count: number
) => {
  const { t } = useLingui();
  let tooltip = name;

  if (asleep && signedOut) {
    tooltip = t({
      message: `${name}, asleep, sign in required`,
      comment:
        "Accessible name and tooltip of a profile's button in the title bar while it sleeps and its Google account is signed out",
    });
  } else if (asleep) {
    tooltip = t({
      message: `${name}, asleep`,
      comment:
        "Tooltip of a profile's button in the title bar while it sleeps: its pages are closed, its mail still checked",
    });
  } else if (signedOut) {
    tooltip = t({
      message: `${name}, sign in required`,
      comment:
        "Accessible name and tooltip of a profile's button in the title bar while its Google account is signed out",
    });
  }

  if (signedOut || count === 0) {
    return { label: tooltip === name ? undefined : tooltip, tooltip };
  }

  const label = asleep
    ? t({
        message: plural(count, {
          one: `${name}, asleep, # unread message`,
          other: `${name}, asleep, # unread messages`,
        }),
        comment:
          "Accessible name of a sleeping profile's button in the title bar while its inbox has unread mail, read by screen readers: the profile's name, that it sleeps, then how many messages are unread",
      })
    : t({
        message: plural(count, {
          one: `${name}, # unread message`,
          other: `${name}, # unread messages`,
        }),
        comment:
          "Accessible name of a profile's button in the title bar while its inbox has unread mail, read by screen readers: the profile's name, then how many messages are unread",
      });

  return { label, tooltip };
};

/** Asks for the profile's menu at a point of the window. */
const openProfileMenu = (profileId: string, x: number, y: number) => {
  shellCalls().openProfileMenu({ profileId, ...wholePoint(x, y) });
};

const ProfileButton = ({
  profile: { id, name, color, mail, asleep },
  selected,
  focusable,
  shortcut,
  onFocus,
  onLeave,
}: {
  profile: ShellProfile;
  selected: boolean;
  /** The one profile of the row the Tab key reaches. */
  focusable: boolean;
  shortcut: string | undefined;
  onFocus: () => void;
  /** Focus moved out of the row. */
  onLeave: () => void;
}) => {
  const shortcutTitle = useShortcutTitle();
  const signedOut = mail.status === "signedOut";
  const count = mail.unreadCount ?? 0;
  const { label, tooltip } = useProfileLabels(name, asleep, signedOut, count);

  return (
    <Button
      variant={selected ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={selected}
      aria-label={label}
      title={shortcutTitle(tooltip, shortcut)}
      tabIndex={focusable ? 0 : -1}
      data-profile-id={id}
      ref={selected ? keepClearOfFades : undefined}
      // A long name is cut short, so other profiles stay in reach; the
      // tooltip has it whole.
      className={cn("max-w-40 flex-none gap-1 px-2.5", asleep && "opacity-50")}
      onFocus={onFocus}
      onBlur={(event) => {
        if (
          !event.currentTarget
            .closest("fieldset")
            ?.contains(event.relatedTarget)
        ) {
          onLeave();
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (isMenuKey(event)) {
          event.preventDefault();

          const { left, bottom } = event.currentTarget.getBoundingClientRect();

          openProfileMenu(id, left, bottom);

          return;
        }

        moveFocus(event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openProfileMenu(id, event.clientX, event.clientY);
      }}
      onClick={() => {
        shellCalls().selectProfile({ profileId: id });
      }}
    >
      <span
        aria-hidden
        className="mr-0.5 size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{name}</span>
      {signedOut ? (
        <CircleAlertIcon aria-hidden className="size-3.5 text-destructive" />
      ) : (
        <UnreadBadge count={count} />
      )}
    </Button>
  );
};

/**
 * One button per profile, drawn only with two or more, scrolling sideways
 * when they do not fit, with an arrow over each clipped end. It is no drag
 * region, so the gap after it drags the window.
 */
const ProfileRow = ({
  profiles,
  shortcuts,
}: {
  profiles: ShellState["profiles"];
  shortcuts: Shortcuts | undefined;
}) => {
  const { t } = useLingui();
  const [scroller, setScroller] = useState<HTMLFieldSetElement | null>(null);
  const clipped = useClippedEnds(scroller);
  const [focused, setFocused] = useState<string>();
  const ids = profiles.profiles.map(({ id }) => id);
  // The selected profile, or the focused one while focus is in the row.
  const focusable =
    focused !== undefined && ids.includes(focused)
      ? focused
      : profiles.selectedProfileId;

  // Back on the button its menu was opened on, or the selected profile's
  // once that is gone.
  useMenuReturn(
    "profile-menu",
    (menu) => menu.profileId,
    (profileId) => {
      (
        scroller?.querySelector<HTMLElement>(
          `[data-profile-id="${CSS.escape(profileId)}"]`
        ) ?? scroller?.querySelector<HTMLElement>('[aria-pressed="true"]')
      )?.focus();
    }
  );

  const scrollBy = (direction: -1 | 1) => {
    if (scroller) {
      scroller.scrollBy({
        left: direction * scroller.clientWidth * 0.8,
        behavior: "smooth",
      });
    }
  };

  const arrows = [
    {
      direction: -1 as const,
      shown: clipped.start,
      label: t({
        message: "Scroll profiles left",
        comment:
          "Accessible name and tooltip of the arrow over the left end of the title bar's row of profiles, when some do not fit",
      }),
      icon: <ChevronLeftIcon />,
    },
    {
      direction: 1 as const,
      shown: clipped.end,
      label: t({
        message: "Scroll profiles right",
        comment:
          "Accessible name and tooltip of the arrow over the right end of the title bar's row of profiles, when some do not fit",
      }),
      icon: <ChevronRightIcon />,
    },
  ];

  return (
    <div className="relative flex min-w-0 [app-region:no-drag]">
      {/* A fieldset is a group, which a screen reader names. */}
      <fieldset
        ref={setScroller}
        aria-label={t({
          message: "Profiles",
          comment:
            "Accessible name of the row of profile buttons in the title bar, read by screen readers",
        })}
        data-tab-scroller
        className="flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto"
      >
        {profiles.profiles.map((profile, index) => (
          <ProfileButton
            key={profile.id}
            profile={profile}
            selected={profile.id === profiles.selectedProfileId}
            focusable={profile.id === focusable}
            shortcut={shortcuts?.[selectProfileCommandId(index + 1)]}
            onFocus={() => {
              setFocused(profile.id);
            }}
            onLeave={() => {
              setFocused(undefined);
            }}
          />
        ))}
      </fieldset>
      {arrows.map(
        ({ direction, shown, label, icon }) =>
          shown && (
            <div
              key={direction}
              className={cn(
                "absolute inset-y-0 flex w-10 items-center from-shell to-transparent",
                direction < 0
                  ? "left-0 justify-start bg-linear-to-r"
                  : "right-0 justify-end bg-linear-to-l"
              )}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                tabIndex={-1}
                // Its title names it; an equal aria-label would be read
                // twice, as name and description.
                title={label}
                className="text-muted-foreground"
                onClick={() => {
                  scrollBy(direction);
                }}
              >
                {icon}
              </Button>
            </div>
          )
      )}
    </div>
  );
};

/**
 * Do Not Disturb's button: a click turns it on until turned off, or off, and
 * the context menu, as the app menu's submenu, offers how long.
 */
const DoNotDisturbButton = () => {
  const { i18n, t } = useLingui();
  const doNotDisturb = useShellState("doNotDisturb");
  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.locale, {
        hour: "numeric",
        minute: "2-digit",
      }),
    [i18n.locale]
  );

  if (!doNotDisturb) {
    return null;
  }

  const { on, until } = doNotDisturb;
  let tooltip = t({
    message: "Do Not Disturb is off",
    comment:
      "Tooltip of the moon button in the title bar while new mail notifications show; a click turns Do Not Disturb on",
  });

  if (on && until === null) {
    tooltip = t({
      message: "Do Not Disturb is on until turned off",
      comment:
        "Tooltip of the moon button in the title bar while it holds new mail notifications until the person turns it off",
    });
  } else if (on && until !== null) {
    const time = timeFormat.format(until);

    tooltip = t({
      message: `Do Not Disturb is on until ${time}`,
      comment:
        "Tooltip of the moon button in the title bar while it holds new mail notifications; {time} is the time of day it ends, such as 14:30",
    });
  }

  return (
    <TitlebarButton
      pressed={on}
      label={t({
        message: "Do Not Disturb",
        comment:
          "Accessible name of the moon button in the title bar that holds new mail notifications, read by screen readers with whether it is pressed",
      })}
      tooltip={tooltip}
      onClick={() => {
        shellCalls().toggleDoNotDisturb({});
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        shellCalls().openDoNotDisturbMenu({});
      }}
    >
      <MoonIcon
        className={cn(
          on && "fill-current text-violet-600 dark:text-violet-400"
        )}
      />
    </TitlebarButton>
  );
};

/**
 * The row across the top: the sidebar toggle and the page's navigation, the
 * profiles, a gap that drags the window, then Open app while the sidebar is
 * hidden, the unified inbox and Do Not Disturb. The whole of it drags the
 * window but for its controls.
 */
export const Titlebar = ({ sidebarShown }: { sidebarShown: boolean }) => {
  const { t } = useLingui();
  const profiles = useShellState("profiles");
  const inbox = useShellState("inbox");
  const shortcuts = useShellState("shortcuts");
  const profileCount = profiles?.profiles.length ?? 0;

  return (
    // The preload stamps data-platform; the traffic lights take the left end on macOS.
    <header
      aria-label={t({
        message: "Title bar",
        comment:
          "Accessible name of the strip across the top of the window, read by screen readers",
      })}
      data-tinted
      style={{ height: TITLEBAR_HEIGHT }}
      className="flex shrink-0 items-center bg-shell px-2 [app-region:drag] in-data-[platform=darwin]:pl-20"
    >
      <div className="mr-2 flex items-center gap-1">
        <SidebarToggle shown={sidebarShown} shortcuts={shortcuts} />
        <NavigationButtons shortcuts={shortcuts} />
      </div>
      {profiles && profileCount >= 2 && (
        <ProfileRow profiles={profiles} shortcuts={shortcuts} />
      )}
      {/* Keeps part of the title bar for dragging the window, however many profiles there are. */}
      <div aria-hidden className="h-full min-w-16 flex-1" />
      <div className="flex items-center gap-1">
        {!sidebarShown && <OpenAppTitlebarButton />}
        <InboxButton
          open={inbox?.open ?? false}
          profileCount={profileCount}
          shortcut={shortcuts?.["inbox.toggle"]}
        />
        <DoNotDisturbButton />
      </div>
    </header>
  );
};

/** The selected profile's colour, which the shell mixes into its greys. */
export const useTint = () => {
  const profiles = useShellState("profiles");

  return profiles?.profiles.find(
    (profile) => profile.id === profiles.selectedProfileId
  )?.color;
};
