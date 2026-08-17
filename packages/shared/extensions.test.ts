import { describe, expect, test } from "bun:test";
import { hostnameToMatchPattern, normalizeExtensionSiteHostname } from "./extensions";

describe("hostnameToMatchPattern", () => {
  test("covers every path of the site over HTTPS", () => {
    expect(hostnameToMatchPattern("sso.okta.com")).toBe("https://sso.okta.com/*");
  });
});

describe("normalizeExtensionSiteHostname", () => {
  test("takes a bare hostname", () => {
    expect(normalizeExtensionSiteHostname("sso.okta.com")).toBe("sso.okta.com");
    expect(normalizeExtensionSiteHostname("login.microsoftonline.com")).toBe(
      "login.microsoftonline.com",
    );
    expect(normalizeExtensionSiteHostname("my-company.onelogin.com")).toBe(
      "my-company.onelogin.com",
    );
  });

  test("lowercases and trims what it takes", () => {
    expect(normalizeExtensionSiteHostname("  SSO.Okta.com ")).toBe("sso.okta.com");
  });

  test("refuses an empty entry", () => {
    expect(normalizeExtensionSiteHostname("")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("   ")).toBeUndefined();
  });

  test("refuses a hostname without a dot", () => {
    expect(normalizeExtensionSiteHostname("localhost")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("okta")).toBeUndefined();
  });

  test("refuses anything more than a hostname", () => {
    expect(normalizeExtensionSiteHostname("https://sso.okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("sso.okta.com/app/login")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("sso.okta.com:8443")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("user@sso.okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("sso okta.com")).toBeUndefined();
  });

  test("refuses a match pattern of its own", () => {
    expect(normalizeExtensionSiteHostname("*.okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("https://*.okta.com/*")).toBeUndefined();
  });

  test("refuses empty labels", () => {
    expect(normalizeExtensionSiteHostname("sso..okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname(".okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("okta.com.")).toBeUndefined();
  });
});
