import { Trans, useLingui } from "@lingui/react/macro";
import { CircleAlertIcon, PlusIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "#ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#ui/empty.tsx";

import { OpenAppPanelButton } from "./open-app.tsx";
import { shellCalls, useShellState } from "./sync.ts";

/**
 * The page area of a profile with no tab: New tab, or, while its Google
 * account is signed out, Sign in first.
 */
export const NothingOpen = () => {
  const { t } = useLingui();
  const headingId = useId();
  const profiles = useShellState("profiles");
  const profile = profiles?.profiles.find(
    (candidate) => candidate.id === profiles.selectedProfileId
  );

  // Until the first poll ends either state could be the wrong one.
  if (!profiles || !profile || profile.mail.status === "unknown") {
    return null;
  }

  const { name } = profile;
  const signedOut = profile.mail.status === "signedOut";
  let description: string;

  if (signedOut) {
    description = t({
      message: `${name}'s Google account is signed out, so its mail is not checked.`,
      comment:
        "Description under Sign in required in the page area of a profile with no Google app open; {name} is the profile's name",
    });
  } else if (profiles.profiles.length > 1) {
    description = t({
      message: `Open Gmail, Calendar or another Google app in ${name}.`,
      comment:
        "Description under No Google apps open when there are several profiles; {name} is the selected profile's name",
    });
  } else {
    description = t({
      message: "Open Gmail, Calendar or another Google app in this profile.",
      comment:
        "Description under No Google apps open when there is only one profile",
    });
  }

  return (
    <section aria-labelledby={headingId} className="flex h-full">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {signedOut ? (
              <CircleAlertIcon aria-hidden className="text-destructive" />
            ) : (
              <PlusIcon aria-hidden />
            )}
          </EmptyMedia>
          <EmptyTitle>
            <h1 id={headingId}>
              {signedOut ? (
                <Trans comment="Heading in the page area of a profile with no Google app open whose Google account is signed out">
                  Sign in required
                </Trans>
              ) : (
                <Trans comment="Heading in the page area of a profile with no Google app open, such as after its last tab was closed">
                  No Google apps open
                </Trans>
              )}
            </h1>
          </EmptyTitle>
          <EmptyDescription className="wrap-anywhere">
            {description}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          {signedOut && (
            <Button
              size="sm"
              onClick={() => {
                shellCalls().openGmail({ profileId: profile.id });
              }}
            >
              <Trans comment="Button in the page area of a profile whose Google account is signed out; it opens Gmail, which shows Google's sign-in page">
                Sign in
              </Trans>
            </Button>
          )}
          <OpenAppPanelButton variant={signedOut ? "ghost" : "outline"} />
        </EmptyContent>
      </Empty>
    </section>
  );
};
