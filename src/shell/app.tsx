import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { PlusIcon } from "lucide-react";
import { useEffect } from "react";

import { TITLEBAR_HEIGHT, viewFrame } from "#core/layout.ts";
import { MAX_SHOWN_UNREAD } from "#core/unread.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "#ui/tabs.tsx";

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

export const App = () => {
  const { t } = useLingui();
  const tabs = useShellState("tabs");
  const settings = useShellState("settings");
  const design = settings?.design ?? "modern";
  const vibrant = settings?.vibrancy ?? false;
  const { inset, radius } = viewFrame(design);

  // The window's vibrancy shows through wherever the page is clear.
  useEffect(() => {
    document.body.classList.toggle("bg-transparent", vibrant);
  }, [vibrant]);

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        vibrant ? "bg-transparent" : "bg-sidebar"
      )}
    >
      {/* The preload stamps data-platform; the traffic lights take the left end on macOS. */}
      <header
        aria-label={t({
          message: "Title bar",
          comment:
            "Accessible name of the strip across the top of the window, read by screen readers",
        })}
        style={{ height: TITLEBAR_HEIGHT }}
        className={cn(
          "flex shrink-0 items-center px-3 [app-region:drag] in-data-[platform=darwin]:pl-20",
          design === "classic" && "border-b border-border"
        )}
      >
        <Profiles />
        {/* Keeps part of the title bar for dragging the window, however many profiles there are. */}
        <div aria-hidden className="h-full min-w-16 flex-1" />
      </header>
      <div className="flex min-h-0 flex-1">
        {tabs && <TabStrip tabs={tabs} bordered={design === "classic"} />}
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
            {tabs && <TabProblem tabs={tabs} />}
          </div>
        </main>
      </div>
      <OverlayLayer />
    </div>
  );
};
