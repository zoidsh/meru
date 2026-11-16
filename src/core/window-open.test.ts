import { describe, expect, it } from "vitest";

import { SIGN_IN_ORIGINS, routeWindowOpen } from "./window-open.ts";

describe(routeWindowOpen, () => {
  it("opens Google's sign-in as a child window", () => {
    for (const url of [
      "https://accounts.google.com/v3/signin/identifier",
      "https://accounts.google.com/",
    ]) {
      expect(routeWindowOpen(url, SIGN_IN_ORIGINS)).toBe("child-window");
    }
  });

  it("opens only the origins it is given as child windows", () => {
    const standIn = ["http://127.0.0.1:4321"];

    expect(routeWindowOpen("http://127.0.0.1:4321/popup", standIn)).toBe(
      "child-window"
    );
    expect(routeWindowOpen("http://127.0.0.1:9999/popup", standIn)).toBe(
      "system-browser"
    );
    expect(routeWindowOpen("https://accounts.google.com/", standIn)).toBe(
      "system-browser"
    );
  });

  it("hands any other web link to the system browser", () => {
    for (const url of [
      "https://example.com/",
      "http://example.com/page?q=1",
      "https://www.google.com/url?q=https://example.com",
      "http://accounts.google.com/",
      "https://accounts.google.com.example.com/",
      "https://drive.google.com/file/d/1",
    ]) {
      expect(routeWindowOpen(url, SIGN_IN_ORIGINS)).toBe("system-browser");
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
      expect(routeWindowOpen(url, SIGN_IN_ORIGINS)).toBe("deny");
    }
  });

  it("refuses Gmail's pop-outs and adding an account until a later slice", () => {
    for (const url of [
      "https://mail.google.com/mail/u/0/?view=cm&fs=1",
      "https://mail.google.com/mail/u/0/popout?ver=1",
      "https://accounts.google.com/AddSession?continue=x",
      "https://accounts.google.com/addsession",
      "https://accounts.google.com/ADDSESSION/identifier",
    ]) {
      expect(routeWindowOpen(url, SIGN_IN_ORIGINS)).toBe("deny");
    }
  });
});
