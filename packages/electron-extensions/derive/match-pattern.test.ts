import { describe, expect, test } from "bun:test";
import { reachesClampedSite } from "./match-pattern";

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
