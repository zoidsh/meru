import { useLingui } from "@lingui/react/macro";
import { PlusIcon } from "lucide-react";

import { TITLEBAR_HEIGHT } from "#core/layout.ts";
import { Button } from "#ui/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "#ui/tabs.tsx";

import { shellCalls, useShellState } from "./sync.ts";

/** Scrolls the tab's list just far enough to show the tab whole. */
const scrollIntoList = (tab: HTMLElement, list: HTMLElement) => {
  const listBox = list.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();

  if (tabBox.left < listBox.left) {
    list.scrollLeft -= listBox.left - tabBox.left;
  } else if (tabBox.right > listBox.right) {
    list.scrollLeft += tabBox.right - listBox.right;
  }
};

/**
 * The selected tab's ref: keeps it in view when it becomes selected and
 * whenever its list changes size.
 */
const keepInView = (tab: HTMLButtonElement | null) => {
  const list = tab?.closest<HTMLElement>('[role="tablist"]');

  if (!tab || !list) {
    return;
  }

  const observer = new ResizeObserver(() => {
    scrollIntoList(tab, list);
  });

  // Observing reports the current size at once, which scrolls it into view.
  observer.observe(list);

  return () => {
    observer.disconnect();
  };
};

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
          className="h-8 max-w-full [scrollbar-width:none] justify-start overflow-x-auto"
        >
          {profiles.profiles.map((profile) => (
            <TabsTrigger
              key={profile.id}
              value={profile.id}
              ref={
                profile.id === profiles.selectedProfileId
                  ? keepInView
                  : undefined
              }
              className="flex-none px-3 text-xs"
              onContextMenu={(event) => {
                event.preventDefault();
                shellCalls().openProfileMenu({ profileId: profile.id });
              }}
            >
              {profile.name}
            </TabsTrigger>
          ))}
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

  return (
    <div className="flex h-full flex-col">
      {/* The preload stamps data-platform; the traffic lights take the left end on macOS. */}
      <header
        aria-label={t({
          message: "Title bar",
          comment:
            "Accessible name of the strip across the top of the window, read by screen readers",
        })}
        style={{ height: TITLEBAR_HEIGHT }}
        className="flex shrink-0 items-center border-b border-border bg-sidebar px-3 [app-region:drag] in-data-[platform=darwin]:pl-20"
      >
        <Profiles />
        {/* Keeps part of the title bar for dragging the window, however many profiles there are. */}
        <div aria-hidden className="h-full min-w-16 flex-1" />
      </header>
      <main
        aria-label={t({
          message: "Content",
          comment:
            "Accessible name of the window's main area, below the title bar, read by screen readers",
        })}
        className="min-h-0 flex-1"
      />
    </div>
  );
};
