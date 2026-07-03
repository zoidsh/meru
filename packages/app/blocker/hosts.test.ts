import { describe, expect, test } from "bun:test";
import { createBlockMatcher } from "./hosts";

describe("createBlockMatcher", () => {
  const matcher = createBlockMatcher({ ads: true, tracking: true });

  test("blocks google ad/tracker hosts and their subdomains", () => {
    const blockedUrls = [
      "https://doubleclick.net/instream/ad",
      "https://ad.doubleclick.net/ddm/ad/foo",
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      "https://mail-ads.google.com/mail/main_jspb?rt=r&client=25&pt=ji",
      "https://www.google-analytics.com/g/collect",
      "https://www.googletagmanager.com/gtm.js",
    ];

    for (const url of blockedUrls) {
      expect(matcher?.(url)).toBe(true);
    }
  });

  test("blocks path-based google telemetry on first-party hosts", () => {
    const blockedUrls = [
      "https://mail.google.com/mail/u/0/generate_204?uaahhg",
      "https://play.google.com/log?format=json&hasfast=true&authuser=0",
      "https://play.google.com/log?hasfast=true&auth=SAPISIDHASH+723f8e33259b7095",
      "https://www.google.com/gen_204?foo=bar",
      "https://www.gstatic.com/gen_204?x",
      "https://docs.google.com/csi?v=2&s=docs&action=load",
    ];

    for (const url of blockedUrls) {
      expect(matcher?.(url)).toBe(true);
    }
  });

  test("blocks known email tracking pixels", () => {
    expect(matcher?.("https://awstrack.me/open/abc")).toBe(true);
    expect(matcher?.("https://example.com/track/open")).toBe(true);
  });

  test("does not block first-party Google surfaces Gmail needs", () => {
    const allowedUrls = [
      "https://mail.google.com/mail/u/0/",
      "https://mail.google.com/sync/u/0/i/s",
      "https://www.gstatic.com/og/_/js/foo.js",
      "https://fonts.gstatic.com/s/inter/foo.woff2",
      "https://lh3.googleusercontent.com/a/avatar",
      "https://apis.google.com/js/api.js",
      "https://accounts.google.com/o/oauth2/",
      "https://play.google.com/store",
      "https://google.com/",
    ];

    for (const url of allowedUrls) {
      expect(matcher?.(url)).toBe(false);
    }
  });

  test("does not match lookalike hosts or in-path occurrences", () => {
    const allowedUrls = [
      "https://evildoubleclick.net/x",
      "https://notgoogle-analytics.com/x",
      "https://example.com/a.doubleclick.net/b",
      "https://example.com/redirect?url=doubleclick.net",
    ];

    for (const url of allowedUrls) {
      expect(matcher?.(url)).toBe(false);
    }
  });
});

describe("createBlockMatcher toggles", () => {
  test("ads only blocks ad hosts, not trackers or telemetry", () => {
    const matcher = createBlockMatcher({ ads: true, tracking: false });

    expect(matcher?.("https://ad.doubleclick.net/ddm/")).toBe(true);
    expect(matcher?.("https://www.google-analytics.com/g/collect")).toBe(false);
    expect(matcher?.("https://mail.google.com/mail/u/0/generate_204?x")).toBe(false);
  });

  test("tracking only blocks trackers and telemetry, not ad hosts", () => {
    const matcher = createBlockMatcher({ ads: false, tracking: true });

    expect(matcher?.("https://www.google-analytics.com/g/collect")).toBe(true);
    expect(matcher?.("https://mail.google.com/mail/u/0/generate_204?x")).toBe(true);
    expect(matcher?.("https://ad.doubleclick.net/ddm/")).toBe(false);
  });

  test("returns undefined when nothing is active", () => {
    expect(createBlockMatcher({ ads: false, tracking: false })).toBeUndefined();
  });
});
