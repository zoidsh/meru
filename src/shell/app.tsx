import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { MoonIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";

import { TITLEBAR_HEIGHT, viewFrame } from "#core/layout.ts";
import { MAX_SHOWN_UNREAD } from "#core/unread.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "#ui/tabs.tsx";

import { Inbox, InboxButton } from "./inbox.tsx";
import { keepInView } from "./keep-in-view.ts";
import { OverlayLayer } from "./overlay.tsx";
import { shellCalls, useShellState } from "./sync.ts";
import { TabProblem, TabStrip } from "./tab-strip.tsx";

const Profiles = () => {
  const { t } = useLingui();
  const profiles = useShellState("profiles");

  if (!profiles) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-1 [app-region:no-drag]">
      <Tabs
        value={profiles.selectedProfileId}
        onValueChange={(profileId: string) => {
          shellCalls().selectProfile({ profileId });
        }}
        className="min-w-0"
      >
        <TabsList
          aria-label={t({
            message: "Profiles",
            comment:
              "Accessible name of the row of profile tabs in the title bar, read by screen readers",
          })}
          data-tab-scroller
          className="h-8 max-w-full [scrollbar-width:none] justify-start overflow-x-auto"
        >
          {profiles.profiles.map(({ id, name, mail }) => {
            const count = mail.unreadCount ?? 0;

            return (
              <TabsTrigger
                key={id}
                value={id}
                ref={id === profiles.selectedProfileId ? keepInView : undefined}
                // A long name is cut short, so other profiles stay in reach;
                // the tooltip has it whole.
                title={name}
                aria-label={
                  count > 0
                    ? t({
                        message: plural(count, {
                          one: `${name}, # unread message`,
                          other: `${name}, # unread messages`,
                        }),
                        comment:
                          "Accessible name of a profile's tab in the title bar while its inbox has unread mail, read by screen readers: the profile's name, then how many messages are unread",
                      })
                    : undefined
                }
                className="max-w-40 flex-none px-3 text-xs"
                // The tabs tell only of a change; asking for the selected
                // profile still shows it in place of the unified inbox.
                onClick={
                  id === profiles.selectedProfileId
                    ? () => {
                        shellCalls().selectProfile({ profileId: id });
                      }
                    : undefined
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  shellCalls().openProfileMenu({ profileId: id });
                }}
              >
                <span className="truncate">{name}</span>
                {count > 0 && (
                  <Badge aria-hidden className="h-4 px-1.5 tabular-nums">
                    {count > MAX_SHOWN_UNREAD
                      ? t({
                          message: `${MAX_SHOWN_UNREAD}+`,
                          comment:
                            "Shown on a profile's unread badge in the title bar when more messages are unread than the number before the plus",
                        })
                      : count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t({
          message: "Add profile",
          comment:
            "Accessible name of the plus button in the title bar that adds a profile, read by screen readers",
        })}
        onClick={() => {
          shellCalls().addProfile({});
        }}
      >
        <PlusIcon />
      </Button>
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
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={on}
      aria-label={t({
        message: "Do Not Disturb",
        comment:
          "Accessible name of the moon button in the title bar that holds new mail notifications, read by screen readers with whether it is pressed",
      })}
      title={tooltip}
      className={cn("[app-region:no-drag]", on && "bg-muted text-foreground")}
      onClick={() => {
        shellCalls().toggleDoNotDisturb({});
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        shellCalls().openDoNotDisturbMenu({});
      }}
    >
      <MoonIcon className={cn(on && "fill-current")} />
    </Button>
  );
};

export const App = () => {
  const { t } = useLingui();
  const tabs = useShellState("tabs");
  const profiles = useShellState("profiles");
  const inbox = useShellState("inbox");
  const { inset, radius } = viewFrame();

  return (
    <div className="flex h-full flex-col bg-shell">
      {/* The preload stamps data-platform; the traffic lights take the left end on macOS. */}
      <header
        aria-label={t({
          message: "Title bar",
          comment:
            "Accessible name of the strip across the top of the window, read by screen readers",
        })}
        style={{ height: TITLEBAR_HEIGHT }}
        className="flex shrink-0 items-center px-3 [app-region:drag] in-data-[platform=darwin]:pl-20"
      >
        <Profiles />
        {/* Keeps part of the title bar for dragging the window, however many profiles there are. */}
        <div aria-hidden className="h-full min-w-16 flex-1" />
        <div className="flex items-center gap-1">
          <InboxButton
            open={inbox?.open ?? false}
            profileCount={profiles?.profiles.length ?? 0}
          />
          <DoNotDisturbButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {tabs && <TabStrip tabs={tabs} />}
        {/* Drawn where main places the view, by the same measurements. */}
        <main
          aria-label={t({
            message: "Content",
            comment:
              "Accessible name of the window's main area, below the title bar, read by screen readers",
          })}
          style={{
            paddingTop: inset.top,
            paddingRight: inset.right,
            paddingBottom: inset.bottom,
            paddingLeft: inset.left,
          }}
          className="flex min-w-0 flex-1"
        >
          <div
            style={{ borderRadius: radius }}
            className="min-w-0 flex-1 overflow-hidden bg-background"
          >
            {inbox?.open ? (
              <Inbox inbox={inbox} />
            ) : (
              tabs && <TabProblem tabs={tabs} />
            )}
          </div>
        </main>
      </div>
      <OverlayLayer />
    </div>
  );
};
