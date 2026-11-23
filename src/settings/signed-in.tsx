import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { CircleAlertIcon } from "lucide-react";

import type { SettingsState } from "#contract/settings.ts";
import { Button } from "#ui/button.tsx";

import { settingsCalls } from "./sync.ts";

type ListedProfile = SettingsState["profiles"][number];

/**
 * Whether anything is said of the profile's Google account: its address once
 * a feed has given it, or that it is signed out. Nothing while its mail is
 * not checked, before its first check ends, or after a failure with no
 * address known.
 */
export const accountShown = ({ mail }: ListedProfile) =>
  mail.status !== "notChecked" &&
  (mail.address !== null || mail.status === "signedOut");

const SignedOutMark = () => (
  <CircleAlertIcon aria-hidden className="size-3.5 shrink-0 text-destructive" />
);

/**
 * Selects the profile in the main window and shows its Gmail tab, where
 * Google's own sign-in is; Settings collects nothing.
 */
const SignInButton = ({ profile }: { profile: ListedProfile }) => {
  const { t } = useLingui();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        settingsCalls().signIn({ profileId: profile.id }).catch(noop);
      }}
    >
      {t({
        message: "Sign in",
        comment:
          "Button in Settings for a profile whose Google account is signed out, which shows Google's sign-in in the main window",
      })}
    </Button>
  );
};

/** On a profile's row in the list: its address, or "Not signed in" after the mark. */
export const AccountSummary = ({ profile }: { profile: ListedProfile }) => {
  const { t } = useLingui();

  if (profile.mail.address !== null) {
    return <span className="truncate">{profile.mail.address}</span>;
  }

  return (
    <>
      <SignedOutMark />
      {t({
        message: "Not signed in",
        comment:
          "Under a profile's name in Settings' list of profiles, when its Google account is signed out",
      })}
    </>
  );
};

/** The line at the top of a profile's page saying which Google account it is signed in to. */
export const AccountLine = ({ profile }: { profile: ListedProfile }) => {
  const { t } = useLingui();
  const { address } = profile.mail;

  if (address !== null) {
    return (
      <p className="truncate px-1 text-sm text-muted-foreground">
        {t({
          message: `Signed in to Google as ${address}.`,
          comment:
            "Line at the top of a profile's page in Settings; {address} is the email address of the Google account the profile is signed in to",
        })}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
      <SignedOutMark />
      <p className="flex-1">
        {t({
          message: "Not signed in to Google, so its mail is not checked.",
          comment:
            "Line at the top of a profile's page in Settings, when its Google account is signed out",
        })}
      </p>
      <SignInButton profile={profile} />
    </div>
  );
};
