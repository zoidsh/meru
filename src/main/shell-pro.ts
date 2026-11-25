import type { EntitlementState } from "#contract/entitlement.ts";
import type { ShellState } from "#contract/shell.ts";
import { downgradeToast } from "#core/entitlement.ts";
import type { ToastMessage } from "#core/overlay.ts";
import type { AppWindow } from "#platform/window.ts";

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

/** The toast for a card's retry that found the license refused or the trial ended. */
const LAPSED_TOASTS: Partial<Record<EntitlementState["status"], ToastMessage>> =
  { refused: "license-refused", trialEnded: "trial-ended" };

/**
 * Tells what lapses of Meru Pro, only while the main window shows, so
 * nothing is told unseen to a window closed to the tray or launched in the
 * background; it tells once the window shows.
 *
 * A license or trial still not confirmed once the launch's refresh has
 * answered or failed gets the card, opened once, before anything else is
 * open; a refresh that confirms it closes the card, and one that finds the
 * license refused or the trial ended closes it with a toast saying so. Meru
 * Pro that ends at the next launch, which only arises while Meru runs and the
 * person may be typing, gets a toast, which takes no focus. Each toast is
 * told once per launch, and only while no other overlay is open, which it
 * would replace.
 */
export const followLicenseNotice = ({
  entitlement,
  overlays,
  window,
  firstRefresh,
}: {
  entitlement: Pick<EntitlementSource, "snapshot" | "onChange">;
  overlays: Pick<
    Overlays,
    "current" | "open" | "close" | "onChange" | "webContentsId"
  >;
  window: Pick<AppWindow, "isVisible" | "on">;
  /** Settles once the launch's refresh has answered or failed. */
  firstRefresh: Promise<unknown>;
}) => {
  const unconfirmedAtLaunch = entitlement.snapshot().status === "unconfirmed";
  let refreshed = false;
  let cardTold = false;
  const told = new Set<ToastMessage>();

  const toast = (message: ToastMessage) => {
    told.add(message);
    overlays.open({ kind: "toast", message });
  };

  const follow = () => {
    const snapshot = entitlement.snapshot();
    const open = overlays.current();

    if (open?.kind === "license" && snapshot.status !== "unconfirmed") {
      const ended = LAPSED_TOASTS[snapshot.status];

      if (ended !== undefined && !told.has(ended)) {
        toast(ended);
      } else {
        overlays.close();
      }

      return;
    }

    if (overlays.webContentsId() === undefined || !window.isVisible()) {
      return;
    }

    if (unconfirmedAtLaunch && !cardTold) {
      if (!refreshed) {
        return;
      }

      cardTold = true;

      if (snapshot.status === "unconfirmed" && open === undefined) {
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

    toast(message);
  };

  entitlement.onChange(follow);
  overlays.onChange(follow);
  window.on("show", follow);
  void firstRefresh.finally(() => {
    refreshed = true;
    follow();
  });
  follow();
};
