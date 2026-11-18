import { Trans, useLingui } from "@lingui/react/macro";
import { CircleAlertIcon } from "lucide-react";
import { useId } from "react";

import type { ShellState } from "#contract/shell.ts";
import { Button } from "#ui/button.tsx";

import { shellCalls } from "./sync.ts";
import { appName } from "./tab-strip.tsx";

type ShellTab = ShellState["tabs"]["tabs"][number];

const OFFLINE = "ERR_INTERNET_DISCONNECTED";

type Problem = Extract<ShellTab["status"], { kind: "failed" | "crashed" }>;

const isProblem = (status: ShellTab["status"]): status is Problem =>
  status.kind === "failed" || status.kind === "crashed";

/**
 * Where the tab's view would be, the selected tab's, a pane's or a tab's own
 * window's, which is hidden while its page failed or crashed, so this is what
 * shows. Its heading is also said by a screen reader as it appears, and not
 * again while retries come and go.
 */
export const TabProblem = ({
  profileId,
  tab,
}: {
  profileId: string;
  tab: Pick<ShellTab, "id" | "app" | "status"> | undefined;
}) => {
  const { t } = useLingui();
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
          tabKey={{ profileId, tabId: tab.id }}
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
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <CircleAlertIcon aria-hidden className="size-8 text-muted-foreground" />
      {status.kind === "failed" ? (
        <>
          <h1 id={headingId} className="text-lg font-semibold">
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
          <h1 id={headingId} className="text-lg font-semibold">
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
