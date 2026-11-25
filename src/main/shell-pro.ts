import type { EntitlementState } from "#contract/entitlement.ts";
import type { ShellState } from "#contract/shell.ts";
import { downgradeToast } from "#core/entitlement.ts";
import type { DowngradeToast } from "#core/entitlement.ts";

import type { LicenseRequests } from "./license-requests.ts";
import type { Overlays } from "./overlay.ts";
import { profileDisplayName } from "./profile-copy.ts";
import type { Profiles } from "./profiles.ts";

interface EntitlementSource {
  snapshot: () => EntitlementState;
  /** Returns what stops it. */
  onChange: (listener: () => void) => () => void;
}

/**
 * The launch's wait for the person's choice after the trial ended, decided
 * once from the entitlement as Meru starts: a trial that ends while Meru runs
 * is a downgrade pending, never this. It ends once no choice is pending, by
 * Continue with Free Version, an accepted key, or a refresh that brings a
 * trial or a license back.
 */
export const createTrialChoice = ({
  entitlement,
}: {
  entitlement: EntitlementSource;
}) => {
  let waiting = entitlement.snapshot().trialChoicePending;

  const { promise: chosen, resolve } = Promise.withResolvers<undefined>();

  if (waiting) {
    const stop = entitlement.onChange(() => {
      if (entitlement.snapshot().trialChoicePending) {
        return;
      }

      stop();
      waiting = false;
      resolve(undefined);
    });
  } else {
    resolve(undefined);
  }

  return {
    /** Whether the launch still waits; nothing of any profile runs meanwhile. */
    waiting: () => waiting,
    /** Settles once the launch may go on, at once when it never waited. */
    chosen,
  };
};

export type TrialChoice = ReturnType<typeof createTrialChoice>;

/** What the main window shows of Meru Pro, from main's own reading of it. */
export const readShellPro = ({
  entitlement,
  licenseRequests,
  trialChoice,
  profiles,
}: {
  entitlement: Pick<EntitlementSource, "snapshot">;
  profiles: Pick<Profiles, "get" | "locked">;
  licenseRequests: Pick<LicenseRequests, "busy">;
  trialChoice: Pick<TrialChoice, "waiting">;
}): ShellState["pro"] => {
  const snapshot = entitlement.snapshot();
  const [first] = profiles.get().profiles;

  return {
    trialChoice: trialChoice.waiting(),
    firstProfile:
      first && profiles.locked().length > 0 ? profileDisplayName(first) : null,
    trialFooterDays: snapshot.trialDaysLeft,
    licenseRequest: licenseRequests.busy(),
    standing: {
      status: snapshot.status,
      unconfirmedReason: snapshot.unconfirmedReason,
      trialDaysLeft: snapshot.trialDaysLeft,
      downgradePending: snapshot.downgradePending,
      hasLicenseKey: snapshot.licenseKey !== null,
    },
  };
};

/** Whether the trial footer shows below the page: while a trial runs. */
export const showsTrialFooter = (
  entitlement: Pick<EntitlementSource, "snapshot">
) => entitlement.snapshot().trialDaysLeft !== null;

/**
 * Tells what lapses of Meru Pro. A license or trial that could not be
 * confirmed at launch gets the license card, opened once as the overlay's
 * view is adopted, before anything else is open, and closed once the status
 * moves on. Meru Pro that ends at the next launch, which only arises while
 * Meru runs and the person may be typing, gets a toast, which takes no focus:
 * once per launch for each wording, and only while no other overlay is open,
 * which it would replace.
 */
export const followLicenseNotice = ({
  entitlement,
  overlays,
}: {
  entitlement: Pick<EntitlementSource, "snapshot" | "onChange">;
  overlays: Pick<
    Overlays,
    "current" | "open" | "close" | "onChange" | "webContentsId"
  >;
}) => {
  let cardDue = entitlement.snapshot().status === "unconfirmed";
  const told = new Set<DowngradeToast>();

  const follow = () => {
    const snapshot = entitlement.snapshot();
    const open = overlays.current();

    if (open?.kind === "license" && snapshot.status !== "unconfirmed") {
      overlays.close();

      return;
    }

    if (overlays.webContentsId() === undefined) {
      return;
    }

    if (cardDue) {
      cardDue = false;

      if (snapshot.status === "unconfirmed") {
        overlays.open({ kind: "license" });
      }

      return;
    }

    const message = downgradeToast({
      ...snapshot,
      hasLicenseKey: snapshot.licenseKey !== null,
    });

    if (message === undefined || told.has(message) || open !== undefined) {
      return;
    }

    told.add(message);
    overlays.open({ kind: "toast", message });
  };

  entitlement.onChange(follow);
  overlays.onChange(follow);
  follow();
};
