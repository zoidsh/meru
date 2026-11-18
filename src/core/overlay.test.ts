import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import {
  OVERLAY_FRAME_NAME,
  isMenu,
  menuPointInside,
  overlayRectangle,
  overlayWidth,
  isOverlayDocument,
  transitionOverlay,
} from "./overlay.ts";
import type { Overlay } from "./overlay.ts";
import {
  newProfile,
  removeProfile,
  selectProfile,
  sleepProfile,
} from "./state.ts";
import type { State } from "./state.ts";
import { closeTab, openTab, selectTab } from "./tabs.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Profile 2")],
  selectedProfileId: "a",
};

const renameA: Overlay = { kind: "rename-profile", profileId: "a" };
const renameB: Overlay = { kind: "rename-profile", profileId: "b" };
const openAppA: Overlay = { kind: "open-app", profileId: "a" };
const menuB: Overlay = { kind: "profile-menu", profileId: "b", x: 120, y: 20 };

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
    expect(
      [renameA, openAppA].map((open) => changed(open, selectProfile(two, "b")))
    ).toStrictEqual([undefined, undefined]);
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
    expect(changed(menuB, withoutB)).toBeUndefined();
  });

  it("closes a tab's menu when its tab goes, and keeps it through a change of another", () => {
    const calendar = findApp(APPS, "calendar");

    if (!calendar) {
      throw new Error("No Calendar in the registry");
    }

    const withCalendar = openTab(two, "a", calendar, calendar.home, () => "cal")
      ?.state as State;
    const withTwo = openTab(
      withCalendar,
      "a",
      calendar,
      calendar.home,
      () => "cal2"
    )?.state as State;
    const menu: Overlay = {
      kind: "tab-menu",
      profileId: "a",
      tabId: "cal",
      x: 10,
      y: 60,
    };
    const after = (next: State) =>
      transitionOverlay(menu, {
        kind: "state-changed",
        previous: withTwo,
        next,
      });

    expect([
      after(closeTab(withTwo, { profileId: "a", tabId: "cal" }) as State),
      after({ ...withTwo, doNotDisturb: { until: null } }),
    ]).toStrictEqual([undefined, menu]);
  });

  it("keeps a profile's menu through its profile put to sleep in the background, and closes it when the selection moves", () => {
    expect([
      changed(menuB, sleepProfile(two, "b")),
      changed(menuB, sleepProfile(two, "a")),
    ]).toStrictEqual([menuB, undefined]);
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
    expect(changed(openAppA, renamed)).toStrictEqual(openAppA);
    expect(changed(undefined, renamed)).toBeUndefined();
  });
});

describe(overlayRectangle, () => {
  it("puts a card's view over the page area, and a menu's over the whole content area", () => {
    const size = { width: 1000, height: 700 };

    expect([
      overlayRectangle(size, "narrow", { kind: "open-app" }),
      overlayRectangle(size, "narrow", { kind: "tab-menu" }),
      overlayRectangle(size, "narrow", { kind: "profile-menu" }),
    ]).toStrictEqual([
      { x: 64, y: 40, width: 928, height: 652 },
      { x: 0, y: 0, width: 1000, height: 700 },
      { x: 0, y: 0, width: 1000, height: 700 },
    ]);
  });
});

describe(isMenu, () => {
  it("is a tab's or a profile's menu, and no card", () => {
    expect(
      (
        [
          "tab-menu",
          "profile-menu",
          "inbox",
          "open-app",
          "rename-profile",
        ] as const
      ).map((kind) => isMenu({ kind }))
    ).toStrictEqual([true, true, false, false, false]);
    expect(isMenu(undefined)).toBeFalsy();
  });
});

describe(menuPointInside, () => {
  it("takes a whole point of the content area, its edges included", () => {
    const size = { width: 100, height: 50 };

    expect(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        { x: 101, y: 0 },
        { x: 0, y: -1 },
        { x: 0.5, y: 0 },
      ].map((point) => menuPointInside(point, size))
    ).toStrictEqual([true, true, false, false, false]);
  });
});

describe(overlayWidth, () => {
  it("is wide for the unified inbox and narrow for the rename panel and Open app", () => {
    expect([
      overlayWidth({ kind: "inbox" }),
      overlayWidth(renameA),
      overlayWidth(openAppA),
    ]).toStrictEqual(["wide", "narrow", "narrow"]);
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
