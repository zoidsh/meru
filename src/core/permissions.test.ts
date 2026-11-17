import { describe, expect, it } from "vitest";

import { APPS } from "./apps.ts";
import { allowsPermission } from "./permissions.ts";

const allows = (
  permission: string,
  requestingUrl: string,
  mediaTypes?: string[],
  topLevelUrl?: string
) =>
  allowsPermission(APPS, {
    permission,
    requestingUrl,
    ...(mediaTypes ? { mediaTypes } : {}),
    ...(topLevelUrl ? { topLevelUrl } : {}),
  });

const YOUTUBE = "https://www.youtube.com/embed/abc";

describe(allowsPermission, () => {
  it.each([
    ["fullscreen", "https://drive.google.com/drive/my-drive"],
    ["clipboard-sanitized-write", "https://docs.google.com/document/d/1"],
    ["fullscreen", "https://docs.google.com/presentation/d/1"],
    ["notifications", "https://calendar.google.com"],
    ["notifications", "https://meet.google.com/abc-defg-hij"],
    ["media", "https://meet.google.com/abc-defg-hij"],
    ["speaker-selection", "https://meet.google.com"],
  ])("gives %s to %s", (permission, url) => {
    expect(allows(permission, url)).toBeTruthy();
  });

  it.each([
    ["notifications", "https://drive.google.com"],
    ["notifications", "https://mail.google.com/mail/u/0/"],
    ["media", "https://mail.google.com"],
    ["media", "https://calendar.google.com"],
    ["display-capture", "https://meet.google.com"],
    ["clipboard-read", "https://docs.google.com"],
    ["geolocation", "https://meet.google.com"],
    ["openExternal", "https://mail.google.com"],
  ])("refuses %s to %s, which its app does not need", (permission, url) => {
    expect(allows(permission, url)).toBeFalsy();
  });

  it.each([
    "https://example.com",
    "https://accounts.google.com",
    "https://meet.google.com.example.com",
    "http://meet.google.com",
    "https://meet.google.com:8443",
    "not a url",
    "",
  ])("gives nothing to %s, which no app claims", (url) => {
    expect(allows("fullscreen", url)).toBeFalsy();
    expect(allows("media", url)).toBeFalsy();
  });

  it("judges fullscreen by the page, so a video another site embeds in an app fills the screen", () => {
    expect(
      allows(
        "fullscreen",
        YOUTUBE,
        undefined,
        "https://mail.google.com/mail/u/0/"
      )
    ).toBeTruthy();
    expect(
      allows("fullscreen", YOUTUBE, undefined, "https://example.com/")
    ).toBeFalsy();
    expect(
      allows(
        "fullscreen",
        "https://drive.google.com",
        undefined,
        "https://example.com/"
      )
    ).toBeFalsy();
  });

  it("judges everything else by the frame that asks, whatever page it is in", () => {
    expect(
      allows(
        "clipboard-sanitized-write",
        YOUTUBE,
        undefined,
        "https://mail.google.com"
      )
    ).toBeFalsy();
    expect(
      allows("media", YOUTUBE, ["audio"], "https://meet.google.com")
    ).toBeFalsy();
    expect(
      allows(
        "notifications",
        "about:blank",
        undefined,
        "https://mail.google.com"
      )
    ).toBeFalsy();
  });

  it("gives Meet audio and video, and nothing else riding on media", () => {
    expect(
      allows("media", "https://meet.google.com", ["audio", "video"])
    ).toBeTruthy();
    expect(allows("media", "https://meet.google.com", ["unknown"])).toBeFalsy();
  });
});
