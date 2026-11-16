import { Trans, useLingui } from "@lingui/react/macro";
import { CircleAlertIcon, LoaderCircleIcon, XIcon } from "lucide-react";

import type { ShellState } from "#contract/shell.ts";
import { APPS, findApp, isAppId } from "#core/apps.ts";
import { TAB_STRIP_WIDTH } from "#core/layout.ts";
import { Button } from "#ui/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "#ui/tabs.tsx";

import { AppIcon } from "./app-icon.tsx";
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

/** The selected profile's tabs, down the left below the titlebar. */
export const TabStrip = ({ tabs }: { tabs: ShellState["tabs"] }) => {
  const { t } = useLingui();
  const { profileId } = tabs;

  return (
    <Tabs
      orientation="vertical"
      value={tabs.selectedTabId}
      onValueChange={(tabId: string) => {
        shellCalls().selectTab({ profileId, tabId });
      }}
      style={{ width: TAB_STRIP_WIDTH }}
      className="shrink-0 border-r border-border bg-sidebar p-2"
    >
      <TabsList
        variant="line"
        aria-label={t({
          message: "Tabs",
          comment:
            "Accessible name of the list of the profile's tabs down the left of the window, read by screen readers",
        })}
        className="w-full items-stretch"
      >
        {tabs.tabs.map((tab) => {
          const title = tabTitle(tab);

          return (
            <div key={tab.id} className="group/tab relative flex items-center">
              <TabsTrigger
                value={tab.id}
                className="h-8 min-w-0 gap-2 pr-8 data-active:bg-background"
              >
                {isAppId(tab.app) && <AppIcon app={tab.app} aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-left">
                  {title}
                </span>
                <TabStatusIcon status={tab.status} />
              </TabsTrigger>
              {tab.closable && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t({
                    message: `Close ${title}`,
                    comment:
                      "Accessible name of the cross on a tab that closes it; {title} is the tab's title",
                  })}
                  className="absolute right-1 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100"
                  onClick={() => {
                    shellCalls().closeTab({ profileId, tabId: tab.id });
                  }}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          );
        })}
      </TabsList>
    </Tabs>
  );
};

const OFFLINE = "ERR_INTERNET_DISCONNECTED";

/**
 * Where the selected tab's view would be, which is hidden while its page
 * failed or crashed, so this is what shows.
 */
export const TabProblem = ({ tabs }: { tabs: ShellState["tabs"] }) => {
  const { t } = useLingui();
  const tab = tabs.tabs.find(
    (candidate) => candidate.id === tabs.selectedTabId
  );

  if (!tab || (tab.status.kind !== "failed" && tab.status.kind !== "crashed")) {
    return null;
  }

  const name = appName(tab.app);
  const key = { profileId: tabs.profileId, tabId: tab.id };
  const { status } = tab;

  return (
    <section
      aria-labelledby="tab-problem-heading"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <CircleAlertIcon aria-hidden className="size-8 text-muted-foreground" />
      {status.kind === "failed" ? (
        <>
          <h1 id="tab-problem-heading" className="text-lg font-semibold">
            {status.reason === OFFLINE ? (
              <Trans comment="Heading shown in place of a tab's page that could not load because the computer is offline">
                You’re offline
              </Trans>
            ) : (
              <Trans comment="Heading shown in place of a tab's page that could not load; {name} is the app, such as Gmail or Calendar">
                {name} couldn’t load
              </Trans>
            )}
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
              shellCalls().retryTab(key);
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
            <Trans comment="Heading shown in place of a tab's page that crashed; {name} is the app, such as Gmail or Calendar">
              {name} stopped working
            </Trans>
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            <Trans comment="Explanation under the heading in place of a tab's page that crashed">
              Its page quit unexpectedly. Reload it to carry on.
            </Trans>
          </p>
          <Button
            variant="outline"
            onClick={() => {
              shellCalls().retryTab(key);
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
