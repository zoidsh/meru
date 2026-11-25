import { describe, expect, it } from "vitest";

import type { EntitlementState } from "#contract/entitlement.ts";
import type { Overlay } from "#core/overlay.ts";
import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import {
  createTrialChoice,
  followLicenseNotice,
  readShellPro,
  showsTrialFooter,
} from "./shell-pro.ts";

const LICENSED: EntitlementState = {
  status: "licensed",
  tier: "pro",
  unconfirmedReason: null,
  trialDaysLeft: null,
  licensee: "Ada",
  deviceName: "Device 4F2A",
  lastConfirmed: 1,
  licenseKey: "MERU-••••-••••-••••-••••-7Q2K",
  downgradePending: false,
  trialChoicePending: false,
};

const ENDED: EntitlementState = {
  ...LICENSED,
  status: "trialEnded",
  tier: "free",
  licensee: null,
  deviceName: null,
  licenseKey: null,
  trialChoicePending: true,
};

/** An entitlement whose snapshot the test moves, announcing each move. */
const fakeEntitlement = (initial: EntitlementState) => {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    snapshot: () => current,
    onChange: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    move: (next: Partial<EntitlementState>) => {
      current = { ...current, ...next };

      for (const listener of listeners) {
        listener();
      }
    },
    listening: () => listeners.size,
  };
};

describe(createTrialChoice, () => {
  it("lets a launch with no choice pending go on at once", async () => {
    const choice = createTrialChoice({
      entitlement: fakeEntitlement(LICENSED),
    });

    expect(choice.waiting()).toBeFalsy();
    await expect(choice.chosen).resolves.toBeUndefined();
  });

  it("waits while the choice is pending, and goes on once it is not, whatever ended it", async () => {
    const entitlement = fakeEntitlement(ENDED);
    const choice = createTrialChoice({ entitlement });
    const told: boolean[] = [];
    let settled = false;

    choice.onChange(() => told.push(choice.waiting()));
    void choice.chosen.finally(() => {
      settled = true;
    });

    // A refresh that says the same again changes nothing.
    entitlement.move({ lastConfirmed: 2 });
    await Promise.resolve();

    expect([choice.waiting(), settled, told]).toStrictEqual([true, false, []]);

    // A refresh that brings a license back, as an accepted key does.
    entitlement.move({ status: "licensed", trialChoicePending: false });
    await choice.chosen;

    expect([choice.waiting(), told, entitlement.listening()]).toStrictEqual([
      false,
      [false],
      0,
    ]);
  });

  it("decides once, at launch: a trial that ends while Meru runs never stops it", () => {
    const entitlement = fakeEntitlement({
      ...LICENSED,
      status: "trial",
      tier: "trial",
    });
    const choice = createTrialChoice({ entitlement });

    entitlement.move({ status: "trialEnded", trialChoicePending: true });

    expect(choice.waiting()).toBeFalsy();
  });
});

const stateOf = (...names: string[]): State => ({
  version: 1,
  profiles: names.map((name, index) => newProfile(`p${index}`, name)),
  selectedProfileId: "p0",
});

const readPro = (
  snapshot: EntitlementState,
  {
    locked = 0,
    busy = false,
    waiting = false,
  }: { locked?: number; busy?: boolean; waiting?: boolean } = {}
) =>
  readShellPro({
    entitlement: { snapshot: () => snapshot },
    licenseRequests: { busy: () => busy },
    trialChoice: { waiting: () => waiting },
    profiles: {
      get: () => stateOf("Personal"),
      locked: () =>
        stateOf(...Array.from({ length: locked }, () => "Work")).profiles,
    },
  });

describe(readShellPro, () => {
  it("counts a running trial's days for the footer, and nothing otherwise", () => {
    const trial = { ...LICENSED, status: "trial", trialDaysLeft: 9 } as const;

    expect([
      readPro(trial).trialFooterDays,
      readPro(LICENSED).trialFooterDays,
      showsTrialFooter({ snapshot: () => trial }),
      showsTrialFooter({ snapshot: () => LICENSED }),
    ]).toStrictEqual([9, null, true, false]);
  });

  it("names the first profile only while the free version keeps others for a license", () => {
    expect([
      readPro(ENDED, { locked: 1 }).firstProfile,
      readPro(ENDED).firstProfile,
    ]).toStrictEqual(["Personal", null]);
  });

  it("gives the wait, the request out and what the notice is worded from, but no license detail", () => {
    expect(readPro(ENDED, { busy: true, waiting: true })).toStrictEqual({
      trialChoice: true,
      firstProfile: null,
      trialFooterDays: null,
      licenseRequest: true,
      standing: {
        status: "trialEnded",
        unconfirmedReason: null,
        trialDaysLeft: null,
        downgradePending: false,
        hasLicenseKey: false,
      },
    });
    expect(readPro(LICENSED).standing.hasLicenseKey).toBeTruthy();
  });
});

/** The overlays as the notice sees them, whose view the shell adopts when the test says. */
const fakeOverlays = () => {
  let open: Overlay | undefined;
  let adopted = false;
  const listeners = new Set<() => void>();
  const opened: Overlay[] = [];
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    current: () => open,
    open: (overlay: Overlay) => {
      open = overlay;
      opened.push(overlay);
      notify();
    },
    close: () => {
      open = undefined;
      notify();
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
    webContentsId: () => (adopted ? 7 : undefined),
    adopt: () => {
      adopted = true;
      notify();
    },
    opened,
  };
};

describe(followLicenseNotice, () => {
  const unconfirmed = {
    ...LICENSED,
    status: "unconfirmed",
    tier: "free",
    unconfirmedReason: "offline",
  } as const;

  it("waits for the overlay's view, then tells a lapse once per launch, however often a refresh repeats it", () => {
    const entitlement = fakeEntitlement(unconfirmed);
    const overlays = fakeOverlays();

    followLicenseNotice({ entitlement, overlays });

    expect(overlays.opened).toStrictEqual([]);

    overlays.adopt();

    expect(overlays.opened).toStrictEqual([{ kind: "license" }]);

    overlays.close();
    entitlement.move({ lastConfirmed: 5 });

    expect(overlays.opened).toHaveLength(1);
  });

  it("tells a downgrade pending after a lapse it already told, each once", () => {
    const entitlement = fakeEntitlement(unconfirmed);
    const overlays = fakeOverlays();

    overlays.adopt();
    followLicenseNotice({ entitlement, overlays });
    overlays.close();
    entitlement.move({
      status: "refused",
      unconfirmedReason: null,
      downgradePending: true,
    });
    overlays.close();
    entitlement.move({ lastConfirmed: 9 });

    expect(overlays.opened).toStrictEqual([
      { kind: "license" },
      { kind: "license" },
    ]);
  });

  it("closes the notice once the license is confirmed, and leaves any other overlay be", () => {
    const entitlement = fakeEntitlement(unconfirmed);
    const overlays = fakeOverlays();

    overlays.adopt();
    followLicenseNotice({ entitlement, overlays });
    entitlement.move({ status: "licensed", unconfirmedReason: null });

    expect(overlays.current()).toBeUndefined();

    overlays.open({ kind: "downloads" });
    entitlement.move({ lastConfirmed: 3 });

    expect(overlays.current()).toStrictEqual({ kind: "downloads" });
  });

  it("tells nothing to a trial, a license, or a free run that never had Pro", () => {
    const overlays = fakeOverlays();

    overlays.adopt();

    for (const snapshot of [
      { ...LICENSED, status: "trial", trialDaysLeft: 3 } as const,
      LICENSED,
      { ...ENDED, trialChoicePending: false },
    ]) {
      followLicenseNotice({ entitlement: fakeEntitlement(snapshot), overlays });
    }

    expect(overlays.opened).toStrictEqual([]);
  });
});
