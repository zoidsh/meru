import { describe, expect, it } from "vitest";

import {
  closeHides,
  menuText,
  trayClick,
  trayEntries,
  trayImageName,
  trayImageNames,
  trayMenuOpensOnClick,
} from "./tray.ts";

const HOME = { id: "p0", name: "Home", unreadCount: 0 };
const WORK = { id: "p1", name: "Work", unreadCount: 3 };

describe(trayImageName, () => {
  it("is the menu bar's template on macOS, unread or not", () => {
    for (const hasUnread of [false, true]) {
      expect(
        trayImageName({
          platform: "darwin",
          hasUnread,
          color: "dark",
          isDark: true,
        })
      ).toBe("IconMenuBarTemplate.png");
    }
  });

  it("follows unread mail, as an icon on Windows and a PNG on Linux", () => {
    expect(
      trayImageName({
        platform: "win32",
        hasUnread: true,
        color: "light",
        isDark: false,
      })
    ).toBe("IconTrayUnread-Light.ico");
    expect(
      trayImageName({
        platform: "linux",
        hasUnread: false,
        color: "dark",
        isDark: true,
      })
    ).toBe("IconTray-Dark.png");
  });

  it("is light on a dark theme and dark on a light one under system", () => {
    expect(
      trayImageName({
        platform: "linux",
        hasUnread: false,
        color: "system",
        isDark: true,
      })
    ).toBe("IconTray-Light.png");
    expect(
      trayImageName({
        platform: "linux",
        hasUnread: false,
        color: "system",
        isDark: false,
      })
    ).toBe("IconTray-Dark.png");
  });
});

describe(trayImageNames, () => {
  it("is the template at both scales on macOS", () => {
    expect(trayImageNames("darwin")).toStrictEqual([
      "IconMenuBarTemplate.png",
      "IconMenuBarTemplate@2x.png",
    ]);
  });

  it("is each colour, read and unread, in the platform's format", () => {
    expect(trayImageNames("win32").toSorted()).toStrictEqual([
      "IconTray-Dark.ico",
      "IconTray-Light.ico",
      "IconTrayUnread-Dark.ico",
      "IconTrayUnread-Light.ico",
    ]);
    expect(trayImageNames("linux")).toHaveLength(4);
    expect(
      trayImageNames("linux").every((name) => name.endsWith(".png"))
    ).toBeTruthy();
  });
});

describe(trayEntries, () => {
  it("offers show and quit with no unread mail", () => {
    expect(
      trayEntries({ profiles: [HOME], windowVisible: false })
    ).toStrictEqual([
      { kind: "profile", profileId: "p0", name: "Home", unreadCount: 0 },
      { kind: "separator" },
      { kind: "toggle", hides: false },
      { kind: "separator" },
      { kind: "quit" },
    ]);
  });

  it("lists several profiles in order, each with its count, and hides a shown window", () => {
    expect(
      trayEntries({
        profiles: [HOME, WORK, { id: "p2", name: "Out", unreadCount: null }],
        windowVisible: true,
      })
    ).toStrictEqual([
      { kind: "profile", profileId: "p0", name: "Home", unreadCount: 0 },
      { kind: "profile", profileId: "p1", name: "Work", unreadCount: 3 },
      { kind: "profile", profileId: "p2", name: "Out", unreadCount: 0 },
      { kind: "separator" },
      { kind: "toggle", hides: true },
      { kind: "separator" },
      { kind: "quit" },
    ]);
  });
});

describe(menuText, () => {
  it("keeps an ampersand as text on Windows and Linux", () => {
    expect(menuText("R&D", "win32")).toBe("R&&D");
    expect(menuText("A && B", "linux")).toBe("A &&&& B");
  });

  it("leaves it alone on macOS, which reads no access keys", () => {
    expect(menuText("R&D", "darwin")).toBe("R&D");
  });
});

describe(trayClick, () => {
  it("hides a shown window", () => {
    expect(
      trayClick({ windowVisible: true, jumpsToUnread: true, profiles: [WORK] })
    ).toStrictEqual({ kind: "hide" });
  });

  it("reveals a hidden one as it was", () => {
    expect(
      trayClick({
        windowVisible: false,
        jumpsToUnread: false,
        profiles: [HOME, WORK],
      })
    ).toStrictEqual({ kind: "reveal" });
  });

  it("first selects the first profile with unread mail when asked to", () => {
    expect(
      trayClick({
        windowVisible: false,
        jumpsToUnread: true,
        profiles: [HOME, WORK],
      })
    ).toStrictEqual({ kind: "reveal", profileId: "p1" });
    expect(
      trayClick({ windowVisible: false, jumpsToUnread: true, profiles: [HOME] })
    ).toStrictEqual({ kind: "reveal" });
  });
});

describe(trayMenuOpensOnClick, () => {
  it("is so on Linux alone", () => {
    expect(trayMenuOpensOnClick("linux")).toBeTruthy();
    expect(trayMenuOpensOnClick("win32")).toBeFalsy();
    expect(trayMenuOpensOnClick("darwin")).toBeFalsy();
  });
});

describe(closeHides, () => {
  it("always hides on macOS until Meru quits", () => {
    expect(
      closeHides({ platform: "darwin", trayShown: false, quitting: false })
    ).toBeTruthy();
    expect(
      closeHides({ platform: "darwin", trayShown: true, quitting: true })
    ).toBeFalsy();
  });

  it("hides on Windows and Linux only while the tray is shown", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(
        closeHides({ platform, trayShown: true, quitting: false })
      ).toBeTruthy();
      expect(
        closeHides({ platform, trayShown: false, quitting: false })
      ).toBeFalsy();
      expect(
        closeHides({ platform, trayShown: true, quitting: true })
      ).toBeFalsy();
    }
  });
});
