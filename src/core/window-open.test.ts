import { describe, expect, it } from "vitest";

import { APPS, standInApps } from "./apps.ts";
import { SIGN_IN_ORIGINS, routeWindowOpen } from "./window-open.ts";

const fromCalendar = {
  childWindowOrigins: SIGN_IN_ORIGINS,
  apps: APPS,
  openerApp: "calendar",
};

const fromGmail = { ...fromCalendar, openerApp: "gmail" };

const route = (url: string, context = fromGmail) =>
  routeWindowOpen(url, context).kind;

describe(routeWindowOpen, () => {
  it("opens Google's sign-in as a child window", () => {
    for (const url of [
      "https://accounts.google.com/v3/signin/identifier",
      "https://accounts.google.com/",
    ]) {
      expect(route(url)).toBe("child-window");
    }
  });

  it("opens only the origins it is given as child windows", () => {
    const standIn = {
      ...fromGmail,
      childWindowOrigins: ["http://127.0.0.1:4321"],
    };

    expect(route("http://127.0.0.1:4321/popup", standIn)).toBe("child-window");
    expect(route("http://127.0.0.1:9999/popup", standIn)).toBe(
      "system-browser"
    );
    expect(route("https://accounts.google.com/", standIn)).toBe(
      "system-browser"
    );
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

  it("opens a Gmail link from another tab in Gmail's, but refuses Gmail's own pop-outs", () => {
    for (const url of [
      "https://mail.google.com/mail/u/0/?view=cm&fs=1",
      "https://mail.google.com/mail/u/0/popout?ver=1",
    ]) {
      expect(route(url, fromGmail)).toBe("deny");
      expect(routeWindowOpen(url, fromCalendar)).toMatchObject({
        kind: "tab",
        app: { id: "gmail" },
      });
    }
  });

  it("hands any other web link to the system browser", () => {
    for (const url of [
      "https://example.com/",
      "http://example.com/page?q=1",
      "https://www.google.com/url?q=https://example.com",
      "http://accounts.google.com/",
      "https://accounts.google.com.example.com/",
      "https://calendar.google.com.example.com/",
    ]) {
      expect(route(url)).toBe("system-browser");
    }
  });

  it("refuses every other scheme and what is not a URL", () => {
    for (const url of [
      "about:blank",
      "file:///etc/passwd",
      "mailto:someone@example.com",
      "data:text/html,hi",
      "chrome://settings",
      "meru-app://shell/index.html",
      "not a url",
      "",
    ]) {
      expect(route(url)).toBe("deny");
    }
  });

  it("refuses adding an account until a later slice", () => {
    for (const url of [
      "https://accounts.google.com/AddSession?continue=x",
      "https://accounts.google.com/addsession",
      "https://accounts.google.com/ADDSESSION/identifier",
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
  });
});
