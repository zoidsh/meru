import { Tabs } from "@base-ui/react/tabs";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import { APPS, findApp, isAppId } from "#core/apps.ts";
import { sidebarWidth } from "#core/sidebar.ts";
import { Button, buttonVariants } from "#ui/button.tsx";
import { ScrollArea } from "#ui/scroll-area.tsx";

import { AppIcon } from "./app-icon.tsx";
import { keepInView } from "./keep-in-view.ts";
import { OpenAppSidebarButton } from "./open-app.tsx";
import { shellCalls } from "./sync.ts";
import { UnreadBadge } from "./unread-badge.tsx";

type ShellTab = ShellState["tabs"]["tabs"][number];

const appName = (app: string) => findApp(APPS, app)?.name ?? app;

const tabTitle = (tab: ShellTab) => tab.title || appName(tab.app);

// The Scroll Area's bar is styled from here, as `src/ui` stays as the CLI
// wrote it: an 8px thumb, shown while the pointer is over the list. Where
// the component's own classes match as strongly, `!` wins.
const SCROLLBAR = cn(
  "[&_[data-slot=scroll-area-scrollbar]]:w-2! [&_[data-slot=scroll-area-scrollbar]]:border-0! [&_[data-slot=scroll-area-scrollbar]]:p-0",
  "[&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity hover:[&_[data-slot=scroll-area-scrollbar]]:opacity-100",
  "[&_[data-slot=scroll-area-thumb]]:bg-foreground/20"
);

/** Said after the title, to a screen reader, where the tab is not live. */
const TabStatusIcon = ({ status }: { status: ShellTab["status"] }) => {
  switch (status.kind) {
    case "loading": {
      return (
        <>
          <LoaderCircleIcon aria-hidden className="animate-spin" />
          <span className="sr-only">
            <Trans comment="Said by screen readers after a tab's title while its page loads">
              Loading
            </Trans>
          </span>
        </>
      );
    }
    case "failed": {
      return (
        <>
          <CircleAlertIcon aria-hidden className="text-destructive" />
          <span className="sr-only">
            <Trans comment="Said by screen readers after a tab's title when its page could not load">
              Couldn’t load
            </Trans>
          </span>
        </>
      );
    }
    case "crashed": {
      return (
        <>
          <CircleAlertIcon aria-hidden className="text-destructive" />
          <span className="sr-only">
            <Trans comment="Said by screen readers after a tab's title when its page crashed">
              Stopped working
            </Trans>
          </span>
        </>
      );
    }
    default: {
      return null;
    }
  }
};

/** The tab after or before `tab` in its list, to take focus as it closes. */
const neighbourOf = (tab: HTMLElement) => {
  const all = [
    ...(tab
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []),
  ];
  const index = all.indexOf(tab);

  return all[index + 1] ?? all[index - 1];
};

/**
 * The selected profile's tabs, down the left below the titlebar: square
 * tiles when narrow, rows with their titles when wide, scrolling when they do
 * not fit. Built on Base UI's tabs directly, since the shadcn component does
 * not hand its orientation to them, which a vertical list's arrow keys need.
 *
 * A close button is not part of its tab, so the list holds tabs alone and
 * arrows through them: Delete or Backspace closes the focused tab, and the
 * buttons, for the pointer, sit over the list out of the tab order.
 */
export const Sidebar = ({
  tabs,
  state,
  unreadCount,
}: {
  tabs: ShellState["tabs"];
  state: "narrow" | "wide";
  /** The profile's unread mail, shown on Gmail's tile. */
  unreadCount: number;
}) => {
  const { t } = useLingui();
  const { profileId } = tabs;
  const [hovered, setHovered] = useState<string>();
  const wide = state === "wide";
  const close = (tabId: string) => {
    shellCalls().closeTab({ profileId, tabId });
  };

  const hover = (tabId: string) => ({
    onPointerEnter: () => {
      setHovered(tabId);
    },
    onPointerLeave: () => {
      setHovered((current) => (current === tabId ? undefined : current));
    },
  });

  const widthLabel = wide
    ? t({
        message: "Narrow sidebar",
        comment:
          "Accessible name and tooltip of the button at the foot of the wide list of tabs that makes it narrow, showing icons alone",
      })
    : t({
        message: "Widen sidebar",
        comment:
          "Accessible name and tooltip of the button at the foot of the narrow list of tabs that makes it wide, showing each tab's title",
      });

  return (
    <Tabs.Root
      data-tinted
      orientation="vertical"
      value={tabs.selectedTabId}
      onValueChange={(tabId: string) => {
        shellCalls().selectTab({ profileId, tabId });
      }}
      style={{ width: sidebarWidth(state) }}
      className={cn(
        "group/sidebar flex min-h-0 shrink-0 flex-col py-3",
        wide ? "px-3" : "px-4"
      )}
    >
      {/* Reaching into the sidebar's padding far enough to centre the bar
          in it, padded back so the list stays where it was. */}
      <ScrollArea
        className={cn(
          "min-h-0 shrink",
          wide ? "-mr-2.5 pr-2.5" : "-mr-3 pr-3",
          SCROLLBAR
        )}
      >
        <div className="relative">
          <Tabs.List
            aria-label={t({
              message: "Tabs",
              comment:
                "Accessible name of the list of the profile's tabs down the left of the window, read by screen readers",
            })}
            className={cn(
              "flex flex-col",
              wide ? "gap-1" : "items-center gap-2"
            )}
          >
            {tabs.tabs.map((tab) => {
              const title = tabTitle(tab);
              const selected = tab.id === tabs.selectedTabId;
              const live =
                tab.status.kind === "live" || tab.status.kind === "unloaded";
              const tabProps = {
                value: tab.id,
                ref: selected ? keepInView : undefined,
                // The tabs tell only of a change; asking for the selected tab
                // still shows it in place of the unified inbox.
                onClick: selected
                  ? () => {
                      shellCalls().selectTab({ profileId, tabId: tab.id });
                    }
                  : undefined,
                onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                  if (
                    tab.closable &&
                    (event.key === "Delete" || event.key === "Backspace")
                  ) {
                    event.preventDefault();
                    neighbourOf(event.currentTarget)?.focus();
                    close(tab.id);
                  }
                },
                ...hover(tab.id),
                className: cn(
                  buttonVariants({
                    variant: selected ? "secondary" : "ghost",
                    size: wide ? "sm" : "icon-sm",
                  }),
                  "relative font-medium",
                  wide && "w-full justify-start gap-2 pr-8",
                  !selected && "text-muted-foreground"
                ),
              };

              // One element tree in either width, so a tab keeps its
              // element, and with it focus, as the sidebar changes width.
              // Wide, its title shows in full and needs no tooltip.
              return (
                <Tabs.Tab
                  key={tab.id}
                  {...tabProps}
                  title={wide ? undefined : title}
                >
                  {(wide || live) && isAppId(tab.app) && (
                    <AppIcon app={tab.app} aria-hidden />
                  )}
                  <span
                    className={
                      wide ? "min-w-0 flex-1 truncate text-left" : "sr-only"
                    }
                  >
                    {title}
                  </span>
                  <TabStatusIcon status={tab.status} />
                  {!wide && tab.app === "gmail" && (
                    <UnreadBadge
                      count={unreadCount}
                      className="pointer-events-none absolute -top-1.5 -right-2 px-1"
                    />
                  )}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 flex flex-col",
              wide ? "gap-1" : "items-center gap-2"
            )}
          >
            {tabs.tabs.map((tab) => {
              const title = tabTitle(tab);
              const label = t({
                message: `Close ${title}`,
                comment:
                  "Accessible name of the cross on a tab that closes it; {title} is the tab's title",
              });

              return (
                <div
                  key={tab.id}
                  className={cn(
                    "relative h-8",
                    wide ? "flex items-center justify-end pr-1" : "w-8"
                  )}
                >
                  {tab.closable &&
                    (wide ? (
                      <Button
                        variant="secondary"
                        size="icon-xs"
                        tabIndex={-1}
                        aria-label={label}
                        {...hover(tab.id)}
                        className={cn(
                          "pointer-events-auto opacity-0",
                          hovered === tab.id && "opacity-100"
                        )}
                        onClick={() => {
                          close(tab.id);
                        }}
                      >
                        <XIcon />
                      </Button>
                    ) : (
                      // Below shadcn's smallest button, kept from v3 to fit
                      // a tile's corner.
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={label}
                        {...hover(tab.id)}
                        className={cn(
                          "pointer-events-auto absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-secondary text-secondary-foreground opacity-0 ring-1 ring-shell [&_svg]:size-2.5",
                          hovered === tab.id && "opacity-100"
                        )}
                        onClick={() => {
                          close(tab.id);
                        }}
                      >
                        <XIcon />
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
      {/* Below the last tab, outside the list's scroll. */}
      <div
        className={cn("flex shrink-0", wide ? "pt-1" : "justify-center pt-2")}
      >
        <OpenAppSidebarButton wide={wide} />
      </div>
      <div
        className={cn(
          "mt-auto flex pt-2 opacity-0 transition-opacity group-hover/sidebar:opacity-100 has-focus-visible:opacity-100",
          wide ? "justify-end" : "justify-center"
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          // Its title names it; an equal aria-label would be read twice,
          // as name and description.
          title={widthLabel}
          className="text-muted-foreground"
          onClick={() => {
            shellCalls().toggleSidebarWidth({});
          }}
        >
          {wide ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
        </Button>
      </div>
    </Tabs.Root>
  );
};

const OFFLINE = "ERR_INTERNET_DISCONNECTED";

type Problem = Extract<ShellTab["status"], { kind: "failed" | "crashed" }>;

const isProblem = (status: ShellTab["status"]): status is Problem =>
  status.kind === "failed" || status.kind === "crashed";

/**
 * Where the selected tab's view would be, which is hidden while its page
 * failed or crashed, so this is what shows. Its heading is also said by a
 * screen reader as it appears, and not again while retries come and go.
 */
export const TabProblem = ({ tabs }: { tabs: ShellState["tabs"] }) => {
  const { t } = useLingui();
  const tab = tabs.tabs.find(
    (candidate) => candidate.id === tabs.selectedTabId
  );
  const status = tab && isProblem(tab.status) ? tab.status : undefined;
  const name = tab ? appName(tab.app) : "";
  let heading: string | undefined;

  if (status?.kind === "crashed") {
    heading = t({
      message: `${name} stopped working`,
      comment:
        "Heading shown in place of a tab's page that crashed; {name} is the app, such as Gmail or Calendar",
    });
  } else if (status?.reason === OFFLINE) {
    heading = t({
      message: "You’re offline",
      comment:
        "Heading shown in place of a tab's page that could not load because the computer is offline",
    });
  } else if (status) {
    heading = t({
      message: `${name} couldn’t load`,
      comment:
        "Heading shown in place of a tab's page that could not load; {name} is the app, such as Gmail or Calendar",
    });
  }

  return (
    <>
      <output className="sr-only">{heading}</output>
      {tab && status && heading && (
        <ProblemPanel
          tabKey={{ profileId: tabs.profileId, tabId: tab.id }}
          name={name}
          status={status}
          heading={heading}
        />
      )}
    </>
  );
};

const ProblemPanel = ({
  tabKey,
  name,
  status,
  heading,
}: {
  tabKey: { profileId: string; tabId: string };
  name: string;
  status: Problem;
  heading: string;
}) => {
  const { t } = useLingui();

  return (
    <section
      aria-labelledby="tab-problem-heading"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <CircleAlertIcon aria-hidden className="size-8 text-muted-foreground" />
      {status.kind === "failed" ? (
        <>
          <h1 id="tab-problem-heading" className="text-lg font-semibold">
            {heading}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {status.reason === OFFLINE ? (
              <Trans comment="Explanation under the offline heading in place of a tab's page; {name} is the app, such as Gmail or Calendar">
                {name} loads by itself when you’re back online.
              </Trans>
            ) : (
              <Trans comment="Explanation under the heading in place of a tab's page that could not load">
                Meru keeps trying by itself.
              </Trans>
            )}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {status.reason}
          </p>
          <Button
            variant="outline"
            disabled={status.retrying}
            onClick={() => {
              shellCalls().retryTab(tabKey);
            }}
          >
            {status.retrying
              ? t({
                  message: "Trying again…",
                  comment:
                    "Label of the disabled button in place of a tab's page while it tries to load the page again",
                })
              : t({
                  message: "Try again",
                  comment:
                    "Button in place of a tab's page that could not load, which tries to load it again now",
                })}
          </Button>
        </>
      ) : (
        <>
          <h1 id="tab-problem-heading" className="text-lg font-semibold">
            {heading}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            <Trans comment="Explanation under the heading in place of a tab's page that crashed">
              Its page quit unexpectedly. Reload it to carry on.
            </Trans>
          </p>
          <Button
            variant="outline"
            onClick={() => {
              shellCalls().retryTab(tabKey);
            }}
          >
            {t({
              message: "Reload",
              comment:
                "Button in place of a tab's page that crashed, which loads the page again",
            })}
          </Button>
        </>
      )}
    </section>
  );
};
