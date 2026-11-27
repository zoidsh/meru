import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import type { CSSProperties } from "react";

import type { ShellState } from "#contract/shell.ts";
import { viewFrame } from "#core/layout.ts";
import { sidebarWidth } from "#core/sidebar.ts";

import { NothingOpen } from "./nothing-open.tsx";
import { OverlayLayer } from "./overlay.tsx";
import { OwnWindows } from "./own-window.tsx";
import { PaneHandle } from "./pane-handle.tsx";
import { shellPlatform } from "./platform.ts";
import { SleepingTab } from "./sleeping-tab.tsx";
import { sleepingSelectedTab } from "./sleeping.ts";
import { useShellState } from "./sync.ts";
import { TabProblem } from "./tab-problem.tsx";
import { Sidebar } from "./tab-strip.tsx";
import { Titlebar } from "./titlebar.tsx";
import { TrialEnded } from "./trial-ended.tsx";
import { TrialFooter } from "./trial-footer.tsx";

type Tabs = ShellState["tabs"];

/**
 * The page area holding one page: the selected tab's view over it, or what
 * shows in its place.
 */
const Page = ({ tabs, radius }: { tabs: Tabs | undefined; radius: number }) => {
  const asleep = tabs && sleepingSelectedTab(tabs);

  return (
    <div
      data-page-area
      style={{ borderRadius: radius }}
      className="min-w-0 flex-1 overflow-hidden bg-background"
    >
      {tabs?.tabs.length === 0 && <NothingOpen />}
      {tabs && tabs.tabs.length > 0 && (
        <>
          <TabProblem
            profileId={tabs.profileId}
            tab={tabs.tabs.find(({ id }) => id === tabs.selectedTabId)}
          />
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
 * the gaps, each a handle that resizes the panes beside it.
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
  <div data-panes data-page-area className="relative min-w-0 flex-1">
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
          <TabProblem profileId={tabs.profileId} tab={tab} />
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
    {tabs.handles.map((handle) => (
      <PaneHandle key={`${handle.before}|${handle.after}`} handle={handle} />
    ))}
  </div>
);

/** The main window as drawn once the launch has gone on. */
const MainWindow = ({ pro }: { pro: ShellState["pro"] }) => {
  const { t } = useLingui();
  const tabs = useShellState("tabs");
  const profiles = useShellState("profiles");
  const sidebar = useShellState("sidebar")?.state ?? "hidden";
  const appearance = useShellState("appearance");
  const tint = appearance?.tint ?? true;
  const footerDays = pro.trialFooterDays;
  const { inset, radius } = viewFrame({
    sidebar,
    trialFooter: footerDays !== null,
  });
  const selected = profiles?.profiles.find(
    (profile) => profile.id === profiles.selectedProfileId
  );

  return (
    <>
      {/* The selected profile's colour, which `styles.css` mixes into the shell's greys at the strength; with none set they stay plain. */}
      <div
        data-tint
        style={
          { "--tint": tint ? selected?.color : undefined } as CSSProperties
        }
        className="flex h-full flex-col bg-shell"
      >
        <Titlebar
          sidebarShown={sidebar !== "hidden"}
          profilesFrom={
            sidebar === "wide"
              ? sidebarWidth(sidebar, shellPlatform()) + inset.left
              : undefined
          }
        />
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
        {footerDays !== null && <TrialFooter days={footerDays} />}
        <OverlayLayer />
      </div>
      <OwnWindows />
    </>
  );
};

export const App = () => {
  const pro = useShellState("pro");

  // Nothing until main says whether the launch waits: the main window would
  // open the overlay's document before main listens for it.
  if (!pro) {
    return null;
  }

  // Until the person chooses, no profile has started, so there is nothing
  // else to draw and no overlay document to open.
  return pro.trialChoice ? <TrialEnded pro={pro} /> : <MainWindow pro={pro} />;
};
