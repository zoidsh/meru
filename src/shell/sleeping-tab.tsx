import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";

import type { ShellState } from "#contract/shell.ts";
import { isAppId } from "#core/apps.ts";
import { Button } from "#ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#ui/empty.tsx";

import { AppIcon } from "./app-icon.tsx";
import { shellCalls } from "./sync.ts";
import { tabTitle } from "./tab-strip.tsx";

/**
 * Where a tab's view was before it was put to sleep, the selected tab's or
 * a pane's: its app, that it sleeps, and Wake, which takes focus as it
 * appears for the selected tab.
 */
export const SleepingTab = ({
  profileId,
  tab,
  selected,
}: {
  profileId: string;
  tab: ShellState["tabs"]["tabs"][number];
  selected: boolean;
}) => {
  const { t } = useLingui();
  const headingId = useId();
  const title = tabTitle(tab);

  return (
    <section
      aria-labelledby={headingId}
      data-sleeping-tab
      className="flex h-full rounded-[inherit] bg-shell ring-1 ring-border ring-inset"
    >
      <Empty>
        <EmptyHeader>
          {isAppId(tab.app) && (
            <EmptyMedia variant="icon">
              <AppIcon app={tab.app} aria-hidden />
            </EmptyMedia>
          )}
          <EmptyTitle className="wrap-anywhere">
            <h1 id={headingId}>
              {t({
                message: `${title} is sleeping`,
                comment:
                  "Heading in place of the selected tab's page after it was put to sleep; {title} is the tab's title or else its Google app's name",
              })}
            </h1>
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button
            key={tab.id}
            variant="outline"
            size="sm"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- Sleep from the menu leaves nothing else to do here
            autoFocus={selected}
            onClick={() => {
              shellCalls().selectTab({ profileId, tabId: tab.id });
            }}
          >
            <Trans comment="Button in place of a sleeping tab's page that loads it again">
              Wake
            </Trans>
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
};
