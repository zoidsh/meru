import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import type { CSSProperties } from "react";

import type { ShellState } from "#contract/shell.ts";
import { viewFrame } from "#core/layout.ts";

import { NothingOpen } from "./nothing-open.tsx";
import { OverlayLayer } from "./overlay.tsx";
import { SleepingTab } from "./sleeping-tab.tsx";
import { sleepingSelectedTab } from "./sleeping.ts";
import { useShellState } from "./sync.ts";
import { Sidebar, TabProblem } from "./tab-strip.tsx";
import { Titlebar } from "./titlebar.tsx";

type Tabs = ShellState["tabs"];

/**
 * The page area holding one page: the selected tab's view over it, or what
 * shows in its place.
 */
const Page = ({ tabs, radius }: { tabs: Tabs | undefined; radius: number }) => {
  const asleep = tabs && sleepingSelectedTab(tabs);

  return (
    <div
      style={{ borderRadius: radius }}
      className="min-w-0 flex-1 overflow-hidden bg-background"
    >
      {tabs?.tabs.length === 0 && <NothingOpen />}
      {tabs && tabs.tabs.length > 0 && (
        <>
          <TabProblem tabs={tabs} />
          {asleep && (
            <SleepingTab profileId={tabs.profileId} tab={asleep} selected />
          )}
        </>
      )}
    </div>
  );
};

/**
 * The page area holding a split: each pane a rounded page where main places
 * its view, one pixel inside it, so the focused pane's ring, drawn over
 * whatever the pane shows, is seen around its view; the shell shows through
 * the gaps.
 */
const Panes = ({
  tabs,
  panes,
  radius,
}: {
  tabs: Tabs;
  panes: NonNullable<Tabs["panes"]>;
  radius: number;
}) => (
  <div data-panes className="relative min-w-0 flex-1">
    {panes.map((pane) => {
      const tab = tabs.tabs.find(({ id }) => id === pane.tabId);
      const focused = pane.tabId === tabs.selectedTabId;

      return (
        <div
          key={pane.tabId}
          data-pane={pane.tabId}
          data-focused={focused || undefined}
          style={{
            left: pane.x,
            top: pane.y,
            width: pane.width,
            height: pane.height,
            borderRadius: radius,
          }}
          className={cn(
            "absolute overflow-hidden bg-background",
            focused &&
              "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-foreground/24 after:ring-inset dark:after:ring-foreground/26"
          )}
        >
          <TabProblem tabs={tabs} tabId={pane.tabId} />
          {tab && pane.asleep && (
            <SleepingTab
              profileId={tabs.profileId}
              tab={tab}
              selected={focused}
            />
          )}
        </div>
      );
    })}
  </div>
);

export const App = () => {
  const { t } = useLingui();
  const tabs = useShellState("tabs");
  const profiles = useShellState("profiles");
  const sidebar = useShellState("sidebar")?.state ?? "hidden";
  const { inset, radius } = viewFrame(sidebar);
  const selected = profiles?.profiles.find(
    (profile) => profile.id === profiles.selectedProfileId
  );

  return (
    <>
      {/* The selected profile's colour, which `styles.css` mixes into the shell's greys. */}
      <div
        data-tint
        style={{ "--tint": selected?.color } as CSSProperties}
        className="flex h-full flex-col bg-shell"
      >
        <Titlebar sidebarShown={sidebar !== "hidden"} />
        <div className="flex min-h-0 flex-1">
          {tabs && sidebar !== "hidden" && (
            <Sidebar
              tabs={tabs}
              state={sidebar}
              unreadCount={selected?.mail.unreadCount ?? 0}
              signedOut={selected?.mail.status === "signedOut"}
            />
          )}
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
            {tabs?.panes ? (
              <Panes tabs={tabs} panes={tabs.panes} radius={radius} />
            ) : (
              <Page tabs={tabs} radius={radius} />
            )}
          </main>
        </div>
        <OverlayLayer />
      </div>
    </>
  );
};
