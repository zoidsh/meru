import { describe, expect, test } from "bun:test";
import { GOOGLE_AD_HOSTS, GOOGLE_TRACKER_HOSTS, isBlockedHost } from "./hosts";
import { EMAIL_TRACKERS_REGEXP } from "./trackers";

const hostnameOf = (url: string) => new URL(url).hostname;

describe("isBlockedHost", () => {
  const allHosts = new Set([...GOOGLE_AD_HOSTS, ...GOOGLE_TRACKER_HOSTS]);

  test("blocks exact and subdomain matches of curated hosts", () => {
    const blockedUrls = [
      "https://doubleclick.net/instream/ad",
      "https://ad.doubleclick.net/ddm/ad/foo",
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      "https://mail-ads.google.com/pagead/",
      "https://www.google-analytics.com/g/collect",
      "https://www.googletagmanager.com/gtm.js",
    ];

    for (const url of blockedUrls) {
      expect(isBlockedHost(hostnameOf(url), allHosts)).toBe(true);
    }
  });

  test("does not block first-party Google hosts Gmail needs", () => {
    const allowedUrls = [
      "https://mail.google.com/mail/u/0/",
      "https://www.gstatic.com/og/_/js/foo.js",
      "https://fonts.gstatic.com/s/inter/foo.woff2",
      "https://lh3.googleusercontent.com/a/avatar",
      "https://apis.google.com/js/api.js",
      "https://accounts.google.com/o/oauth2/",
      "https://google.com/",
    ];

    for (const url of allowedUrls) {
      expect(isBlockedHost(hostnameOf(url), allHosts)).toBe(false);
    }
  });

  test("does not match on non-label-boundary suffixes", () => {
    expect(isBlockedHost("evildoubleclick.net", allHosts)).toBe(false);
    expect(isBlockedHost("notgoogle-analytics.com", allHosts)).toBe(false);
  });
});

describe("blocklist toggles", () => {
  test("ads set blocks ad hosts but not tracker hosts", () => {
    const adsOnly = new Set(GOOGLE_AD_HOSTS);

    expect(isBlockedHost("ad.doubleclick.net", adsOnly)).toBe(true);
    expect(isBlockedHost("www.google-analytics.com", adsOnly)).toBe(false);
  });

  test("tracker set blocks tracker hosts but not ad hosts", () => {
    const trackingOnly = new Set(GOOGLE_TRACKER_HOSTS);

    expect(isBlockedHost("www.google-analytics.com", trackingOnly)).toBe(true);
    expect(isBlockedHost("ad.doubleclick.net", trackingOnly)).toBe(false);
  });
});

describe("EMAIL_TRACKERS_REGEXP", () => {
  test("matches known email tracking pixels", () => {
    expect(EMAIL_TRACKERS_REGEXP.test("https://awstrack.me/open/abc")).toBe(true);
    expect(EMAIL_TRACKERS_REGEXP.test("https://example.com/track/open")).toBe(true);
  });

  test("does not match ordinary email content", () => {
    expect(EMAIL_TRACKERS_REGEXP.test("https://lh3.googleusercontent.com/a/avatar")).toBe(false);
  });
});
