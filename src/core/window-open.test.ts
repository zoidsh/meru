import { describe, expect, it } from "vitest";

import {
  APPS,
  entitledApps,
  linkApps,
  opensInMeru,
  standInApps,
} from "./apps.ts";
import type { AppOpening } from "./apps.ts";
import { entitledSetting } from "./entitled-settings.ts";
import {
  SIGN_IN_ORIGINS,
  allowsChildNavigation,
  routeWindowOpen,
} from "./window-open.ts";

const fromCalendar = {
  signInOrigins: SIGN_IN_ORIGINS,
  apps: APPS,
  openerApp: "calendar",
};

const fromGmail = { ...fromCalendar, openerApp: "gmail" };

const route = (url: string, context = fromGmail) =>
  routeWindowOpen(url, context).kind;

const GMAIL = "https://mail.google.com/mail/u/0";

const CHAT_ATTACHMENT =
  "https://chat.google.com/u/0/api/get_attachment_url?url_type=DOWNLOAD_URL&attachment_token=x";

const PDF_VIEWER =
  "https://1a2b-apps-viewer.googleusercontent.com/viewer/secure/pdf/3c4d/5e6f/*/7a8b?jsapi=1";

describe(routeWindowOpen, () => {
  it("opens Google's sign-in as a child window", () => {
    for (const url of [
      "https://accounts.google.com/v3/signin/identifier",
      "https://accounts.google.com/",
    ]) {
      expect(route(url)).toBe("child-window");
      expect(route(url, fromCalendar)).toBe("child-window");
    }
  });

  it("opens only the sign-in origins it is given as child windows", () => {
    const standIn = {
      ...fromGmail,
      signInOrigins: ["http://127.0.0.1:4321"],
    };

    expect(route("http://127.0.0.1:4321/popup", standIn)).toBe("child-window");
    expect(route("http://127.0.0.1:9999/popup", standIn)).toBe(
      "system-browser"
    );
    expect(route("https://accounts.google.com/", standIn)).toBe(
      "system-browser"
    );
  });

  it("opens Gmail's own pop-outs from Gmail as child windows", () => {
    for (const url of [
      `${GMAIL}/popout?ver=1#cmid%253D1`,
      `${GMAIL}/popout?ver=1&search=inbox&type=x&th=%23thread-f%3A1&cvid=1`,
      `${GMAIL}/popout?ver=1#attid%253D0.1`,
      `${GMAIL}/?ui=2&ik=1&view=lg&permmsgid=msg-a:r1`,
      `${GMAIL}/?ik=1&view=pt&search=all&permthid=thread-a:r1&simpl=msg-a:r1`,
      `${GMAIL}/?ui=2&ik=1&attid=0.1&permmsgid=msg-a:r1&th=1&view=att&disp=inline&realattid=f_1&zw`,
      `${GMAIL}/d/delegated`,
      "https://mail.google.com/mail/u/1/popout?ver=1",
    ]) {
      expect(route(url)).toBe("child-window");
    }
  });

  it("loads Gmail's inbox in Gmail's tab, from Gmail or another app", () => {
    for (const url of [
      `${GMAIL}/`,
      GMAIL,
      `${GMAIL}/#inbox/abc`,
      "https://mail.google.com/",
      "https://mail.google.com/mail/u/2/",
    ]) {
      expect(routeWindowOpen(url, fromGmail)).toMatchObject({
        kind: "tab",
        app: { id: "gmail" },
      });
    }

    for (const url of [`${GMAIL}/#inbox/abc`, `${GMAIL}/popout?ver=1`]) {
      expect(routeWindowOpen(url, fromCalendar)).toMatchObject({
        kind: "tab",
        app: { id: "gmail" },
      });
    }
  });

  it("opens a link an app claims as a tab of that app", () => {
    expect(
      routeWindowOpen("https://calendar.google.com/calendar/r", fromGmail)
    ).toMatchObject({ kind: "tab", app: { id: "calendar" } });
    expect(
      routeWindowOpen("https://docs.google.com/spreadsheets/d/1", fromGmail)
    ).toMatchObject({ kind: "tab", app: { id: "sheets" } });
    expect(
      routeWindowOpen("https://drive.google.com/file/d/1", fromGmail)
    ).toMatchObject({ kind: "tab", app: { id: "drive" } });
  });

  it("hands any other web link to the system browser, as it is", () => {
    for (const url of [
      "https://example.com/",
      "http://example.com/page?q=1",
      "http://accounts.google.com/",
      "https://accounts.google.com.example.com/",
      "https://calendar.google.com.example.com/",
      "https://myaccount.google.com/",
    ]) {
      expect(routeWindowOpen(url, fromGmail)).toStrictEqual({
        kind: "system-browser",
        url,
      });
    }
  });

  it("hands a link in mail to the system browser unwrapped, even one an app claims", () => {
    expect(
      routeWindowOpen(
        "https://www.google.com/url?q=https://example.com/a&source=gmail&ust=1&usg=x",
        fromGmail
      )
    ).toStrictEqual({ kind: "system-browser", url: "https://example.com/a" });
    expect(
      routeWindowOpen(
        "https://www.google.com/url?q=https://calendar.google.com/calendar/r",
        fromGmail
      )
    ).toStrictEqual({
      kind: "system-browser",
      url: "https://calendar.google.com/calendar/r",
    });
  });

  it("hands a redirect it will not unwrap to the system browser as it is", () => {
    for (const url of [
      "https://www.google.com/url?q=https://accounts.google.com/AddSession",
      "https://www.google.com/url?q=javascript:alert(1)",
      "https://www.google.com/url",
    ]) {
      expect(routeWindowOpen(url, fromGmail)).toStrictEqual({
        kind: "system-browser",
        url,
      });
    }
  });

  it("answers adding an account with a profile, on the sign-in origin alone", () => {
    for (const url of [
      "https://accounts.google.com/AddSession?continue=x",
      "https://accounts.google.com/addsession",
      "https://accounts.google.com/ADDSESSION/identifier",
    ]) {
      expect(route(url)).toBe("add-profile");
      expect(route(url, fromCalendar)).toBe("add-profile");
    }

    expect(route("https://example.com/AddSession")).toBe("system-browser");
    expect(route("https://accounts.google.com/AddSessionX")).toBe(
      "child-window"
    );
    expect(route("https://accounts.google.com/addsessions/x")).toBe(
      "child-window"
    );
    expect(route("http://accounts.google.com/AddSession")).toBe(
      "system-browser"
    );
    expect(
      route("http://127.0.0.1:4321/AddSession?continue=x", {
        ...fromGmail,
        signInOrigins: ["http://127.0.0.1:4321"],
      })
    ).toBe("add-profile");
  });

  it("has the page download a Google Chat attachment, which no window would paint", () => {
    for (const url of [
      CHAT_ATTACHMENT,
      "https://chat.google.com/u/2/api/get_attachment_url",
    ]) {
      expect(route(url)).toBe("download");
      expect(route(url, fromCalendar)).toBe("download");
    }

    for (const url of [
      "https://chat.google.com/u/0/api/get_attachment_urls",
      "https://chat.google.com/api/get_attachment_url",
      "https://chat.google.com.example.com/u/0/api/get_attachment_url",
      "https://example.com/chat.google.com/u/0/api/get_attachment_url",
    ]) {
      expect(route(url)).toBe("system-browser");
    }
  });

  it("opens Google's secure PDF viewer as a window, unless asked for behind the page", () => {
    expect(route(PDF_VIEWER)).toBe("child-window");
    expect(route(PDF_VIEWER, fromCalendar)).toBe("child-window");
    expect(
      route(
        "https://doc-0o-5c-apps-viewer.googleusercontent.com/viewer/secure/pdf"
      )
    ).toBe("child-window");
    expect(
      routeWindowOpen(PDF_VIEWER, fromGmail, { inBackground: true })
    ).toStrictEqual({ kind: "system-browser", url: PDF_VIEWER });

    for (const url of [
      "https://1a2b-apps-viewer.googleusercontent.com/viewer/other",
      "https://googleusercontent.com.example.com/viewer/secure/pdf/1",
      "http://1a2b-apps-viewer.googleusercontent.com/viewer/secure/pdf/1",
      "https://1a2b-apps-viewer.googleusercontent.com/viewer/secure/pdfx/1",
      "https://lh3.googleusercontent.com/viewer/secure/pdf/1",
      "https://apps-viewer.googleusercontent.com.example.com/viewer/secure/pdf/1",
    ]) {
      expect(route(url)).toBe("system-browser");
    }
  });

  it("refuses every other scheme, credentials and what is not a URL", () => {
    for (const url of [
      "about:blank",
      "file:///etc/passwd",
      "mailto:someone@example.com",
      "data:text/html,hi",
      `${"javascript"}:alert(1)`,
      "chrome://settings",
      "meru-app://shell/index.html",
      "https://someone@example.com/",
      "https://user@accounts.google.com/AddSession",
      "https://user@mail.google.com/mail/u/0/popout",
      "not a url",
      "",
    ]) {
      expect(route(url)).toBe("deny");
    }
  });

  it("claims only the stand-ins' origins in the suite's build", () => {
    const apps = standInApps({
      gmail: "http://127.0.0.1:1000/",
      calendar: "http://127.0.0.1:2000/",
    });
    const context = { ...fromGmail, apps };

    expect(
      routeWindowOpen("http://127.0.0.1:2000/event", context)
    ).toMatchObject({ kind: "tab", app: { id: "calendar" } });
    expect(route("https://calendar.google.com/", context)).toBe(
      "system-browser"
    );
    expect(route("http://127.0.0.1:1000/mail/u/0/popout?ver=1", context)).toBe(
      "child-window"
    );
    expect(route("http://127.0.0.1:1000/", context)).toBe("tab");
  });
});

describe(allowsChildNavigation, () => {
  it("lets a window go to sign-in and to its opener app's own pages", () => {
    for (const url of [
      `${GMAIL}/popout?ver=1`,
      `${GMAIL}/?view=lg`,
      "https://accounts.google.com/v3/signin/identifier",
      PDF_VIEWER,
    ]) {
      expect(allowsChildNavigation(url, fromGmail)).toBeTruthy();
    }

    expect(
      allowsChildNavigation("https://calendar.google.com/", fromCalendar)
    ).toBeTruthy();
  });

  it("keeps a sign-in window from adding an account itself, which the router answers", () => {
    for (const url of [
      "https://accounts.google.com/AddSession?continue=x",
      "https://accounts.google.com/addsession/identifier",
    ]) {
      expect(allowsChildNavigation(url, fromGmail)).toBeFalsy();
      expect(route(url)).toBe("add-profile");
    }
  });

  it("keeps it from anywhere else", () => {
    for (const url of [
      "https://example.com/",
      "https://calendar.google.com/calendar/r",
      "https://www.google.com/url?q=https://example.com/",
      "http://mail.google.com/mail/u/0/",
      "https://user@mail.google.com/mail/u/0/",
      "https://mail.google.com.example.com/",
      CHAT_ATTACHMENT,
      `${"javascript"}:alert(1)`,
      "about:blank",
      "",
    ]) {
      expect(allowsChildNavigation(url, fromGmail)).toBeFalsy();
    }
  });
});

/** Where a link goes from a page of `openerApp`, the apps narrowed by `opening`. */
const routed = (
  url: string,
  opening: AppOpening,
  openerApp = "gmail",
  workspaceApps = true
) =>
  routeWindowOpen(url, {
    signInOrigins: SIGN_IN_ORIGINS,
    apps: linkApps(entitledApps(APPS, workspaceApps), opening, openerApp),
    openerApp,
  }).kind;

describe("Tabs & Apps' settings", () => {
  const ON = { openAppsInMeru: true, appsInDefaultBrowser: [] };
  const CALENDAR = "https://calendar.google.com/calendar/r";
  const DRIVE = "https://drive.google.com/drive/my-drive";
  const POPOUT = `${GMAIL}/popout?ver=1`;

  it("opens every app's links as tabs at their defaults", () => {
    expect([routed(CALENDAR, ON), routed(DRIVE, ON)]).toStrictEqual([
      "tab",
      "tab",
    ]);
  });

  it("sends a link to any other app out with the switch off, whatever is excluded", () => {
    for (const appsInDefaultBrowser of [[], ["calendar"]]) {
      const off = { openAppsInMeru: false, appsInDefaultBrowser };

      expect([routed(CALENDAR, off), routed(DRIVE, off)]).toStrictEqual([
        "system-browser",
        "system-browser",
      ]);
    }
  });

  it("sends an excluded app's links out and opens the rest as tabs", () => {
    const drive = { openAppsInMeru: true, appsInDefaultBrowser: ["drive"] };

    expect([routed(CALENDAR, drive), routed(DRIVE, drive)]).toStrictEqual([
      "tab",
      "system-browser",
    ]);
  });

  it("ignores an app id it does not know", () => {
    const unknown = {
      openAppsInMeru: true,
      appsInDefaultBrowser: ["keep", "notebooklm"],
    };

    expect([routed(CALENDAR, unknown), routed(DRIVE, unknown)]).toStrictEqual([
      "tab",
      "tab",
    ]);
  });

  it("keeps the opener's own app and Gmail in Meru, its pop-outs included", () => {
    const off = { openAppsInMeru: false, appsInDefaultBrowser: ["drive"] };

    expect([
      routed(DRIVE, off, "drive"),
      routed(GMAIL, off, "calendar"),
      routed(POPOUT, off),
    ]).toStrictEqual(["tab", "tab", "child-window"]);
    expect(
      allowsChildNavigation(DRIVE, {
        signInOrigins: SIGN_IN_ORIGINS,
        apps: linkApps(APPS, off, "drive"),
        openerApp: "drive",
      })
    ).toBeTruthy();
  });

  it("opens only Gmail in Meru on the free version, whatever is stored", () => {
    for (const stored of [true, false]) {
      const opening = {
        openAppsInMeru: entitledSetting("openAppsInMeru", stored, () => false),
        appsInDefaultBrowser: entitledSetting(
          "appsInDefaultBrowser",
          ["calendar"],
          () => false
        ),
      };

      expect([
        routed(CALENDAR, opening, "gmail", false),
        routed(DRIVE, opening, "gmail", false),
        routed(POPOUT, opening, "gmail", false),
        routed(GMAIL, opening, "calendar", false),
      ]).toStrictEqual([
        "system-browser",
        "system-browser",
        "child-window",
        "tab",
      ]);
    }
  });
});

describe(opensInMeru, () => {
  it("opens Gmail in Meru always, and another app only with the switch on and the app not excluded", () => {
    const gmail = { id: "gmail" } as const;
    const drive = { id: "drive" } as const;

    expect([
      opensInMeru(gmail, {
        openAppsInMeru: false,
        appsInDefaultBrowser: ["gmail"],
      }),
      opensInMeru(drive, { openAppsInMeru: true, appsInDefaultBrowser: [] }),
      opensInMeru(drive, {
        openAppsInMeru: true,
        appsInDefaultBrowser: ["drive"],
      }),
      opensInMeru(drive, { openAppsInMeru: false, appsInDefaultBrowser: [] }),
    ]).toStrictEqual([true, true, false, false]);
  });
});
