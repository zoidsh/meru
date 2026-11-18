import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import {
  OVERLAY_FRAME_NAME,
  overlayWidth,
  isOverlayDocument,
  transitionOverlay,
} from "./overlay.ts";
import type { Overlay } from "./overlay.ts";
import { newProfile, removeProfile, selectProfile } from "./state.ts";
import type { State } from "./state.ts";
import { openTab, selectTab } from "./tabs.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Profile 2")],
  selectedProfileId: "a",
};

const renameA: Overlay = { kind: "rename-profile", profileId: "a" };
const renameB: Overlay = { kind: "rename-profile", profileId: "b" };

const changed = (current: Overlay | undefined, next: State | undefined) =>
  transitionOverlay(current, {
    kind: "state-changed",
    previous: two,
    next: next as State,
  });

describe(transitionOverlay, () => {
  it("opens one, replaces it with the next, and closes", () => {
    const opened = transitionOverlay(undefined, {
      kind: "open",
      overlay: renameA,
    });

    expect(opened).toStrictEqual(renameA);
    expect(
      transitionOverlay(opened, { kind: "open", overlay: renameB })
    ).toStrictEqual(renameB);
    expect(transitionOverlay(opened, { kind: "close" })).toBeUndefined();
  });

  it("closes when another profile is selected", () => {
    expect(changed(renameA, selectProfile(two, "b"))).toBeUndefined();
  });

  it("closes when another tab of the profile is selected", () => {
    const calendar = findApp(APPS, "calendar");

    if (!calendar) {
      throw new Error("No Calendar in the registry");
    }

    const withCalendar = openTab(two, "a", calendar, calendar.home, () => "cal")
      ?.state as State;

    expect(
      transitionOverlay(renameA, {
        kind: "state-changed",
        previous: withCalendar,
        next: selectTab(withCalendar, {
          profileId: "a",
          tabId: "gmail",
        }) as State,
      })
    ).toBeUndefined();
  });

  it("closes when its profile goes", () => {
    const withoutB = removeProfile(two, "b") as State;

    expect(changed(renameB, withoutB)).toBeUndefined();
  });

  it("keeps the unified inbox open through another profile selected, which closes it itself", () => {
    expect(changed({ kind: "inbox" }, selectProfile(two, "b"))).toStrictEqual({
      kind: "inbox",
    });
  });

  it("stays open through a change that leaves what is underneath", () => {
    const renamed: State = {
      ...two,
      profiles: [newProfile("a", "Work"), newProfile("b", "Profile 2")],
    };

    expect(changed(renameA, renamed)).toStrictEqual(renameA);
    expect(changed(renameB, renamed)).toStrictEqual(renameB);
    expect(changed(undefined, renamed)).toBeUndefined();
  });
});

describe(overlayWidth, () => {
  it("is wide for the unified inbox and narrow for the rename panel", () => {
    expect([
      overlayWidth({ kind: "inbox" }),
      overlayWidth(renameA),
    ]).toStrictEqual(["wide", "narrow"]);
  });
});

describe(isOverlayDocument, () => {
  it("is only the overlay's blank document", () => {
    expect(
      [OVERLAY_FRAME_NAME, "another-name", "", "elsewhere"].map((frameName) =>
        isOverlayDocument({ url: "about:blank", frameName })
      )
    ).toStrictEqual([true, false, false, false]);
    expect(
      [
        "https://mail.google.com/",
        "about:blank#x",
        "meru-app://shell/index.html",
      ].map((url) => isOverlayDocument({ url, frameName: OVERLAY_FRAME_NAME }))
    ).toStrictEqual([false, false, false]);
  });
});
