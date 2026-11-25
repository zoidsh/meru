import type { EntitlementState } from "#contract/entitlement.ts";
import type { ShellState } from "#contract/shell.ts";
import { lapseNotice } from "#core/entitlement.ts";

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
 * Opens the license notice once per launch for each lapse: the license or
 * trial not confirmed, or Meru Pro ending at the next launch. A refresh that
 * says the same again opens nothing, and one that clears it closes the
 * notice. It waits for the overlay's view, which the shell opens as it
 * mounts.
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
  const told = new Set<NonNullable<ReturnType<typeof lapseNotice>>>();

  const follow = () => {
    const notice = lapseNotice(entitlement.snapshot());
    const shown = overlays.current()?.kind === "license";

    if (notice === undefined) {
      if (shown) {
        overlays.close();
      }

      return;
    }

    if (told.has(notice) || overlays.webContentsId() === undefined) {
      return;
    }

    told.add(notice);
    overlays.open({ kind: "license" });
  };

  entitlement.onChange(follow);
  overlays.onChange(follow);
  follow();
};
