import { Trans, useLingui } from "@lingui/react/macro";
import { PowerIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "#ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#ui/empty.tsx";

import { shellCalls } from "./sync.ts";

/**
 * The page area of the selected profile while it sleeps, which it is only
 * when no other is awake: that it sleeps, and Wake, which takes focus as it
 * appears.
 */
export const SleepingProfile = ({
  profileId,
  name,
}: {
  profileId: string;
  name: string;
}) => {
  const { t } = useLingui();
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-sleeping-pane
      className="flex h-full rounded-[inherit] bg-shell ring-1 ring-border ring-inset"
    >
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-secondary">
            <PowerIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle className="wrap-anywhere">
            <h1 id={headingId}>
              {t({
                message: `${name} is sleeping`,
                comment:
                  "Heading of the page area while the selected profile sleeps, its pages closed and its mail still checked; {name} is the profile's name",
              })}
            </h1>
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button
            key={profileId}
            variant="outline"
            size="sm"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- Sleep from a menu leaves nothing else to do here
            autoFocus
            onClick={() => {
              shellCalls().selectProfile({ profileId });
            }}
          >
            <Trans comment="Button in the page area of a sleeping profile that loads its pages again">
              Wake
            </Trans>
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
};
