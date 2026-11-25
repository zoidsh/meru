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
    let settled = false;

    void choice.chosen.finally(() => {
      settled = true;
    });

    // A refresh that says the same again changes nothing.
    entitlement.move({ lastConfirmed: 2 });
    await Promise.resolve();

    expect([choice.waiting(), settled]).toStrictEqual([true, false]);

    // A refresh that brings a license back, as an accepted key does.
    entitlement.move({ status: "licensed", trialChoicePending: false });
    await choice.chosen;

    expect([choice.waiting(), entitlement.listening()]).toStrictEqual([
      false,
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

/**
 * The main window as the notices see it: whether it holds the keys, as
 * focus reads it, and its focus and show events.
 */
const fakeWindow = (holdsKeys = true) => {
  let active = holdsKeys;
  const listeners = new Map<string, Set<() => void>>();

  const emit = (event: string) => {
    for (const listener of listeners.get(event) ?? []) {
      listener();
    }
  };

  return {
    active: () => active,
    on: (event: string, listener: () => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    },
    blur: () => {
      active = false;
    },
    focus: () => {
      active = true;
      emit("focus");
    },
  };
};

/** Follows the notices with the overlay's view adopted and the window holding the keys, unless told otherwise. */
const follow = (
  snapshot: EntitlementState,
  {
    window = fakeWindow(),
    firstRefresh = Promise.resolve(),
  }: {
    window?: ReturnType<typeof fakeWindow>;
    firstRefresh?: Promise<unknown>;
  } = {}
) => {
  const entitlement = fakeEntitlement(snapshot);
  const overlays = fakeOverlays();

  overlays.adopt();
  followLicenseNotice({
    entitlement,
    overlays,
    window,
    windowActive: window.active,
    firstRefresh,
  });

  return { entitlement, overlays, window };
};

describe(followLicenseNotice, () => {
  const unconfirmed = {
    ...LICENSED,
    status: "unconfirmed",
    tier: "free",
    unconfirmedReason: "offline",
  } as const;
  const trial = {
    ...LICENSED,
    status: "trial",
    tier: "trial",
    trialDaysLeft: 3,
    licenseKey: null,
  } as const;

  it("opens the card for a license still not confirmed once the launch's refresh has failed, and only once", async () => {
    const refresh = Promise.withResolvers<undefined>();
    const { entitlement, overlays } = follow(unconfirmed, {
      firstRefresh: refresh.promise,
    });

    expect(overlays.opened).toStrictEqual([]);

    refresh.resolve(undefined);
    await refresh.promise;
    await Promise.resolve();

    expect(overlays.opened).toStrictEqual([{ kind: "license" }]);

    overlays.close();
    entitlement.move({ lastConfirmed: 5 });

    expect(overlays.opened).toHaveLength(1);
  });

  it("opens no card when the launch's refresh confirms the license, so it never flashes", async () => {
    const refresh = Promise.withResolvers<undefined>();
    const { entitlement, overlays } = follow(unconfirmed, {
      firstRefresh: refresh.promise,
    });

    entitlement.move({ status: "licensed", unconfirmedReason: null });
    refresh.resolve(undefined);
    await refresh.promise;
    await Promise.resolve();

    expect(overlays.opened).toStrictEqual([]);
  });

  it("closes the card when a retry confirms the license, and says so with a toast when it finds the license refused", async () => {
    const confirmed = follow(unconfirmed);

    await Promise.resolve();
    confirmed.entitlement.move({ status: "licensed", unconfirmedReason: null });

    expect(confirmed.overlays.current()).toBeUndefined();

    const refused = follow(unconfirmed);

    await Promise.resolve();
    refused.entitlement.move({ status: "refused", unconfirmedReason: null });

    expect(refused.overlays.current()).toStrictEqual({
      kind: "toast",
      message: "license-refused",
    });
  });

  it("tells Pro ending at the next launch by a toast, once per wording, never by the card", () => {
    const { entitlement, overlays } = follow(trial);

    entitlement.move({
      status: "unconfirmed",
      unconfirmedReason: "offline",
      downgradePending: true,
    });
    overlays.close();
    entitlement.move({ lastConfirmed: 9 });
    entitlement.move({ status: "trialEnded", unconfirmedReason: null });

    expect(overlays.opened).toStrictEqual([
      { kind: "toast", message: "pro-ends-trial-unconfirmed" },
      { kind: "toast", message: "pro-ends-trial-ended" },
    ]);
  });

  it("keeps a toast while the window does not hold the keys, and tells it once as the window is focused", () => {
    const window = fakeWindow(false);
    const { entitlement, overlays } = follow(trial, { window });

    entitlement.move({ status: "trialEnded", downgradePending: true });

    expect(overlays.opened).toStrictEqual([]);

    window.focus();
    overlays.close();
    window.blur();
    window.focus();

    expect(overlays.opened).toStrictEqual([
      { kind: "toast", message: "pro-ends-trial-ended" },
    ]);
  });

  it("waits for an open overlay to close before its toast, which would replace it", () => {
    const { entitlement, overlays } = follow(trial);

    overlays.open({ kind: "downloads" });
    entitlement.move({ status: "trialEnded", downgradePending: true });

    expect(overlays.current()).toStrictEqual({ kind: "downloads" });

    overlays.close();

    expect(overlays.current()).toStrictEqual({
      kind: "toast",
      message: "pro-ends-trial-ended",
    });
  });

  it("tells nothing to a trial, a license, or a free run that never had Pro", async () => {
    const runs = [trial, LICENSED, { ...ENDED, trialChoicePending: false }].map(
      (snapshot) => follow(snapshot)
    );

    await Promise.resolve();

    expect(runs.flatMap(({ overlays }) => overlays.opened)).toStrictEqual([]);
  });
});
