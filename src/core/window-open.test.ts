import { describe, expect, it } from "vitest";

import { routeWindowOpen } from "./window-open.ts";

describe(routeWindowOpen, () => {
  it("opens Google's sign-in as a child window", () => {
    expect(
      routeWindowOpen("https://accounts.google.com/v3/signin/identifier")
    ).toBe("child-window");
    expect(routeWindowOpen("https://accounts.google.com/")).toBe(
      "child-window"
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
      expect(routeWindowOpen(url)).toBe("system-browser");
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
      expect(routeWindowOpen(url)).toBe("deny");
    }
  });

  it("refuses Gmail's pop-outs and adding an account until a later slice", () => {
    for (const url of [
      "https://mail.google.com/mail/u/0/?view=cm&fs=1",
      "https://mail.google.com/mail/u/0/popout?ver=1",
      "https://accounts.google.com/AddSession?continue=x",
    ]) {
      expect(routeWindowOpen(url)).toBe("deny");
    }
  });
});
