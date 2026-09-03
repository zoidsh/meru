import { describe, expect, test } from "bun:test";
import { matchesUrl, reachesClampedSite } from "./match-pattern";

const CLAMPED_SITE = "https://accounts.google.com/*";

describe("reachesClampedSite", () => {
  test("reaches the site from a pattern naming every URL", () => {
    expect(reachesClampedSite("<all_urls>", CLAMPED_SITE)).toBe(true);
  });

  test("reaches the site from a wildcard host", () => {
    expect(reachesClampedSite("https://*/*", CLAMPED_SITE)).toBe(true);
  });

  test("reaches the site from a subdomain wildcard covering it", () => {
    expect(reachesClampedSite("https://*.google.com/*", CLAMPED_SITE)).toBe(true);
  });

  test("reaches the site from a subdomain wildcard spelling it exactly", () => {
    expect(reachesClampedSite("https://*.accounts.google.com/*", CLAMPED_SITE)).toBe(true);
  });

  test("reaches the site from the host itself, whatever path it names", () => {
    expect(reachesClampedSite("https://accounts.google.com/signin/*", CLAMPED_SITE)).toBe(true);
  });

  test("reaches the site from a wildcard scheme", () => {
    expect(reachesClampedSite("*://accounts.google.com/*", CLAMPED_SITE)).toBe(true);
  });

  test("does not reach the site from another host", () => {
    expect(reachesClampedSite("https://app.kolide.com/*", CLAMPED_SITE)).toBe(false);
  });

  test("does not reach the site from a suffix it only ends with", () => {
    expect(reachesClampedSite("https://*.notgoogle.com/*", CLAMPED_SITE)).toBe(false);
  });

  test("does not reach an https site from an http pattern", () => {
    expect(reachesClampedSite("http://accounts.google.com/*", CLAMPED_SITE)).toBe(false);
  });

  test("does not reach an http site from a wildcard scheme on another scheme", () => {
    expect(reachesClampedSite("*://accounts.google.com/*", "file://accounts.google.com/*")).toBe(
      false,
    );
  });

  test("reaches everything a clamp with no single site to ask about names", () => {
    expect(reachesClampedSite("https://app.kolide.com/*", "<all_urls>")).toBe(true);
    expect(reachesClampedSite("https://app.kolide.com/*", "https://*.google.com/*")).toBe(true);
  });

  test("reaches nothing from a pattern that cannot be read", () => {
    expect(reachesClampedSite("accounts.google.com", CLAMPED_SITE)).toBe(false);
  });
});

/*
 * The other question a match pattern answers: whether it reaches a page that is
 * actually open, which is what `chrome.tabs.query({url})` filters on.
 */
describe("matchesUrl", () => {
  const PAGE_URL = "https://accounts.google.com/signin/v2?flow=gmail";

  test("matches the host and the path a pattern names", () => {
    expect(matchesUrl("https://accounts.google.com/*", PAGE_URL)).toBe(true);
    expect(matchesUrl("https://accounts.google.com/signin/*", PAGE_URL)).toBe(true);
    expect(matchesUrl("*://accounts.google.com/*", PAGE_URL)).toBe(true);
    expect(matchesUrl("https://*.google.com/*", PAGE_URL)).toBe(true);
    expect(matchesUrl("https://*/*", PAGE_URL)).toBe(true);
  });

  test("holds a pattern to its scheme, its host and its path alike", () => {
    expect(matchesUrl("http://accounts.google.com/*", PAGE_URL)).toBe(false);
    expect(matchesUrl("https://mail.google.com/*", PAGE_URL)).toBe(false);
    expect(matchesUrl("https://*.notgoogle.com/*", PAGE_URL)).toBe(false);
    expect(matchesUrl("https://accounts.google.com/settings/*", PAGE_URL)).toBe(false);
  });

  // Chrome matches a pattern's path against the URL's path and query together
  test("matches the query string as part of the path", () => {
    expect(matchesUrl("https://accounts.google.com/signin/v2", PAGE_URL)).toBe(false);
    expect(matchesUrl("https://accounts.google.com/signin/v2?flow=gmail", PAGE_URL)).toBe(true);
  });

  test("every URL means Chrome's own list of schemes, not the wildcard's two", () => {
    expect(matchesUrl("<all_urls>", PAGE_URL)).toBe(true);
    expect(matchesUrl("<all_urls>", "file:///home/tim/notes.html")).toBe(true);
    expect(matchesUrl("*://*/*", "file:///home/tim/notes.html")).toBe(false);
    expect(matchesUrl("<all_urls>", "chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/x")).toBe(
      false,
    );
  });

  test("a file URL matches on its path, there being no host to match", () => {
    expect(matchesUrl("file:///*", "file:///home/tim/notes.html")).toBe(true);
    expect(matchesUrl("file:///home/*", "file:///home/tim/notes.html")).toBe(true);
    expect(matchesUrl("file:///etc/*", "file:///home/tim/notes.html")).toBe(false);
  });

  test("a pattern that cannot be read, and a URL that is none, reach nothing", () => {
    expect(matchesUrl("accounts.google.com", PAGE_URL)).toBe(false);
    expect(matchesUrl("<all_urls>", "not a url")).toBe(false);
    expect(matchesUrl("https://accounts.google.com/*", "")).toBe(false);
  });
});
