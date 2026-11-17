import { Tabs } from "@base-ui/react/tabs";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { CircleAlertIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import { APPS, findApp, isAppId } from "#core/apps.ts";
import { TAB_STRIP_WIDTH } from "#core/layout.ts";
import { Button } from "#ui/button.tsx";

import { AppIcon } from "./app-icon.tsx";
import { keepInView } from "./keep-in-view.ts";
import { shellCalls } from "./sync.ts";

type ShellTab = ShellState["tabs"]["tabs"][number];

const appName = (app: string) => findApp(APPS, app)?.name ?? app;

const tabTitle = (tab: ShellTab) => tab.title || appName(tab.app);

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

/**
 * The selected profile's tabs, down the left below the titlebar, scrolling
 * when they do not fit. Built on Base UI's tabs directly, since the shadcn
 * component does not hand its orientation to them, which a vertical list's
 * arrow keys need.
 *
 * A close button is not part of its tab, so the list holds tabs alone and
 * arrows through them: Delete or Backspace closes the focused tab, and the
 * buttons, for the pointer, sit over the list out of the tab order.
 */
export const TabStrip = ({ tabs }: { tabs: ShellState["tabs"] }) => {
  const { t } = useLingui();
  const { profileId } = tabs;
  const [hovered, setHovered] = useState<string>();
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

  return (
    <Tabs.Root
      orientation="vertical"
      value={tabs.selectedTabId}
      onValueChange={(tabId: string) => {
        shellCalls().selectTab({ profileId, tabId });
      }}
      style={{ width: TAB_STRIP_WIDTH }}
      className="flex min-h-0 shrink-0 flex-col"
    >
      <div
        data-tab-scroller
        className="relative min-h-0 flex-1 overflow-y-auto p-2"
      >
        <Tabs.List
          aria-label={t({
            message: "Tabs",
            comment:
              "Accessible name of the list of the profile's tabs down the left of the window, read by screen readers",
          })}
          className="flex flex-col gap-1"
        >
          {tabs.tabs.map((tab) => (
            <Tabs.Tab
              key={tab.id}
              value={tab.id}
              ref={tab.id === tabs.selectedTabId ? keepInView : undefined}
              // The tabs tell only of a change; asking for the selected tab
              // still shows it in place of the unified inbox.
              onClick={
                tab.id === tabs.selectedTabId
                  ? () => {
                      shellCalls().selectTab({ profileId, tabId: tab.id });
                    }
                  : undefined
              }
              onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                if (
                  tab.closable &&
                  (event.key === "Delete" || event.key === "Backspace")
                ) {
                  event.preventDefault();
                  // Gmail's tab, first and never closed, is always a neighbour.
                  const neighbour =
                    event.currentTarget.nextElementSibling ??
                    event.currentTarget.previousElementSibling;

                  if (neighbour instanceof HTMLElement) {
                    neighbour.focus();
                  }

                  close(tab.id);
                }
              }}
              {...hover(tab.id)}
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 pr-8 text-sm font-medium text-foreground/60 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-muted-foreground dark:hover:text-foreground data-active:bg-background data-active:text-foreground dark:data-active:bg-input/30 dark:data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
            >
              {isAppId(tab.app) && <AppIcon app={tab.app} aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-left">
                {tabTitle(tab)}
              </span>
              <TabStatusIcon status={tab.status} />
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col gap-1">
          {tabs.tabs.map((tab) => {
            const title = tabTitle(tab);

            return (
              <div
                key={tab.id}
                className="flex h-8 items-center justify-end pr-1"
              >
                {tab.closable && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    tabIndex={-1}
                    aria-label={t({
                      message: `Close ${title}`,
                      comment:
                        "Accessible name of the cross on a tab that closes it; {title} is the tab's title",
                    })}
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
                )}
              </div>
            );
          })}
        </div>
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
