import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import {
  OVERLAY_FRAME_NAME,
  coversPage,
  leavesViewFree,
  overlayRectangle,
  overlayWidth,
  isShellDocument,
  staysOpenOutside,
  transitionOverlay,
} from "./overlay.ts";
import type { Overlay } from "./overlay.ts";
import {
  OWN_WINDOW_FRAME_PREFIX,
  ownWindowDownloadsFrameName,
  ownWindowFindFrameName,
  ownWindowFrameName,
} from "./own-window.ts";
import { newProfile, removeProfile, selectProfile } from "./state.ts";
import type { State } from "./state.ts";
import { openTab, selectTab } from "./tabs.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Profile 2")],
  selectedProfileId: "a",
};

const openAppA: Overlay = { kind: "open-app", profileId: "a" };
const openAppB: Overlay = { kind: "open-app", profileId: "b" };
const findA: Overlay = { kind: "find", profileId: "a", tabId: "gmail" };

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
      overlay: openAppA,
    });

    expect(opened).toStrictEqual(openAppA);
    expect(
      transitionOverlay(opened, { kind: "open", overlay: findA })
    ).toStrictEqual(findA);
    expect(transitionOverlay(opened, { kind: "close" })).toBeUndefined();
  });

  it("keeps the update card through another profile or tab selected", () => {
    const card: Overlay = { kind: "update", card: "ready", version: "4.2.0" };

    expect(changed(card, selectProfile(two, "b"))).toStrictEqual(card);
  });

  it("keeps a toast open through a change of state, until it is replaced or closes", () => {
    const toast: Overlay = { kind: "toast", message: "no-room" };

    expect([
      changed(toast, selectProfile(two, "b")),
      transitionOverlay(toast, { kind: "open", overlay: openAppA }),
    ]).toStrictEqual([toast, openAppA]);
  });

  it("closes when another profile is selected", () => {
    expect(
      [openAppA, findA].map((open) => changed(open, selectProfile(two, "b")))
    ).toStrictEqual([undefined, undefined]);
  });

  it("closes when another tab of the profile is selected", () => {
    const calendar = findApp(APPS, "calendar");

    if (!calendar) {
      throw new Error("No Calendar in the registry");
    }

    const withCalendar = openTab(two, "a", calendar, calendar.home, () => "cal")
      ?.state as State;

    const next = selectTab(withCalendar, {
      profileId: "a",
      tabId: "gmail",
    }) as State;

    expect(
      [openAppA, { ...findA, tabId: "cal" } as const].map((open) =>
        transitionOverlay(open, {
          kind: "state-changed",
          previous: withCalendar,
          next,
        })
      )
    ).toStrictEqual([undefined, undefined]);
  });

  it("closes when its profile goes", () => {
    const withoutB = removeProfile(two, "b") as State;

    expect(changed(openAppB, withoutB)).toBeUndefined();
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

    expect(changed(openAppA, renamed)).toStrictEqual(openAppA);
    expect(changed(openAppB, renamed)).toStrictEqual(openAppB);
    expect(changed(findA, renamed)).toStrictEqual(findA);
    expect(changed(undefined, renamed)).toBeUndefined();
  });
});

describe(overlayRectangle, () => {
  it("puts a card's view over the page area", () => {
    expect(
      overlayRectangle(
        { width: 1000, height: 700 },
        { sidebar: "narrow", trialFooter: false },
        "linux",
        {
          kind: "open-app",
        }
      )
    ).toStrictEqual({ x: 64, y: 40, width: 928, height: 652 });
  });

  it("puts a toast's view in the page area's bottom right corner, no larger than the area", () => {
    expect([
      overlayRectangle(
        { width: 1000, height: 700 },
        { sidebar: "narrow", trialFooter: false },
        "linux",
        {
          kind: "toast",
        }
      ),
      overlayRectangle(
        { width: 300, height: 100 },
        { sidebar: "hidden", trialFooter: false },
        "linux",
        {
          kind: "toast",
        }
      ),
    ]).toStrictEqual([
      { x: 576, y: 596, width: 416, height: 96 },
      { x: 8, y: 40, width: 284, height: 52 },
    ]);
  });

  it("puts the update card's view in the page area's bottom right corner, the card and its 8px inset", () => {
    expect(
      overlayRectangle(
        { width: 1000, height: 700 },
        { sidebar: "narrow", trialFooter: false },
        "linux",
        { kind: "update" }
      )
    ).toStrictEqual({ x: 664, y: 560, width: 328, height: 132 });
  });

  it("puts the find bar's view at the top right of the focused pane, or of the page area", () => {
    const size = { width: 1000, height: 700 };

    expect([
      overlayRectangle(
        size,
        { sidebar: "narrow", trialFooter: false },
        "linux",
        { kind: "find" }
      ),
      overlayRectangle(
        size,
        { sidebar: "narrow", trialFooter: false },
        "linux",
        { kind: "find" },
        { x: 0, y: 326, width: 928, height: 326 }
      ),
    ]).toStrictEqual([
      { x: 631, y: 48, width: 353, height: 40 },
      { x: 631, y: 374, width: 353, height: 40 },
    ]);
  });
});

describe(coversPage, () => {
  it("is a card, never the find bar, a toast or a drop", () => {
    expect(
      (
        ["open-app", "inbox", "downloads", "find", "toast", "drop"] as const
      ).map((kind) => coversPage({ kind }))
    ).toStrictEqual([true, true, true, false, false, false]);
    expect(coversPage({ kind: "update" })).toBeFalsy();
    expect(coversPage(undefined)).toBeFalsy();
  });
});

describe(staysOpenOutside, () => {
  it("is the find bar, the license notice and the update card", () => {
    expect(
      (
        ["find", "license", "update", "open-app", "inbox", "toast"] as const
      ).map((kind) => staysOpenOutside({ kind }))
    ).toStrictEqual([true, true, true, false, false, false]);
  });
});

describe(leavesViewFree, () => {
  it("is nothing open, or the update card, which gives way to what waits", () => {
    expect([
      leavesViewFree(undefined),
      leavesViewFree({ kind: "update" }),
      ...(["find", "license", "toast", "open-app", "downloads"] as const).map(
        (kind) => leavesViewFree({ kind })
      ),
    ]).toStrictEqual([true, true, false, false, false, false, false]);
  });
});

describe(overlayWidth, () => {
  it("is wide for the unified inbox, medium for New tab and Downloads", () => {
    expect([
      overlayWidth({ kind: "inbox" }),
      overlayWidth(openAppA),
      overlayWidth({ kind: "downloads" }),
    ]).toStrictEqual(["wide", "medium", "medium"]);
  });
});

describe(isShellDocument, () => {
  it("is only the overlay's blank document or an own window's titlebar, find bar or Downloads card", () => {
    expect(
      [
        OVERLAY_FRAME_NAME,
        ownWindowFrameName({ profileId: "a", tabId: "t" }),
        ownWindowFindFrameName({ profileId: "a", tabId: "t" }),
        ownWindowDownloadsFrameName({ profileId: "a", tabId: "t" }),
        `${OWN_WINDOW_FRAME_PREFIX}["a"]`,
        "another-name",
        "",
        "elsewhere",
      ].map((frameName) => isShellDocument({ url: "about:blank", frameName }))
    ).toStrictEqual([true, true, true, true, false, false, false, false]);
    expect(
      [
        "https://mail.google.com/",
        "about:blank#x",
        "meru-app://shell/index.html",
      ].map((url) => isShellDocument({ url, frameName: OVERLAY_FRAME_NAME }))
    ).toStrictEqual([false, false, false]);
  });
});
