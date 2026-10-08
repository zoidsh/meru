import { describe, expect, test } from "bun:test";
import {
  BITWARDEN_EXTENSION_ID,
  curatedExtensions,
  getConflictingExtensionIds,
  getSkippedPasswordManagerIds,
  hostnameToMatchPattern,
  normalizeExtensionSiteHostname,
  ONEPASSWORD_EXTENSION_ID,
} from "./extensions";

/**
 * Hosts the extensions have to keep reaching, one per shape the catalog could
 * plausibly swallow: the product API, the certificate revocation endpoint that
 * shares a second-level domain with two telemetry hosts, and the sign-in host
 * the content script clamp is written around.
 */
const PRODUCT_URLS = [
  "https://my.1password.com/api/v2/account",
  "https://crl.1passwordservices.com/1password.crl",
  "https://accounts.google.com/signin",
];

/**
 * The catalog's patterns as the loader's filter reads them: scheme, host, and
 * a path that matches everything under it.
 */
function parseTelemetryUrl(telemetryUrl: string) {
  const [, host] = telemetryUrl.match(/^https:\/\/([^/*]+)\/\*$/) ?? [];

  return host;
}

const telemetryUrls = curatedExtensions.flatMap(
  (curatedExtension) => curatedExtension.telemetryUrls ?? [],
);

const benignWorkerConsoleErrors = curatedExtensions.flatMap(
  (curatedExtension) => curatedExtension.benignWorkerConsoleErrors ?? [],
);

/**
 * Worker error lines a healthy session writes, against whether the catalog
 * answers for them. `<autofill-item>` is the one that has to stay at error: it
 * was a real relay fault rather than 1Password's own behavior, and a prefix
 * that stopped at the request bracket would take it down to debug beside the
 * two benign siblings it is logged next to.
 */
const WORKER_ERROR_LINES: { line: string; isBenign: boolean }[] = [
  { line: "[LogManager] Failed to send log metrics: <redacted>", isBenign: true },
  {
    line: "[Messaging] Exception while handling request <get-nested-frame-configuration>: <redacted>",
    isBenign: true,
  },
  {
    line: "[Messaging] Exception while handling request <remove-inline-button>: <redacted>",
    isBenign: true,
  },
  {
    line: "[Messaging] Exception while handling request <autofill-item>: <redacted>",
    isBenign: false,
  },
  {
    line: "[Fill] Failed to get active tab when checking for an open and fill tab",
    isBenign: false,
  },
];

describe("curated extension benign worker console errors", () => {
  /*
   * A prefix is matched with `startsWith`, where the empty string matches
   * every message: one blank entry, or one trimmed down to a word, would take
   * every error an extension's worker reports down to debug — and that console
   * is the only place a worker's failure surfaces at all.
   */
  test("every prefix names one line rather than a class of them", () => {
    for (const benignWorkerConsoleError of benignWorkerConsoleErrors) {
      expect(benignWorkerConsoleError.trim()).toBe(benignWorkerConsoleError);

      expect(benignWorkerConsoleError.length).toBeGreaterThan(20);
    }
  });

  /*
   * The list read the way the forwarder reads it, against the lines it was
   * written for and the ones it was written around.
   */
  test("answers for the known-benign lines and no others", () => {
    for (const { line, isBenign } of WORKER_ERROR_LINES) {
      expect(
        benignWorkerConsoleErrors.some((benignWorkerConsoleError) =>
          line.startsWith(benignWorkerConsoleError),
        ),
      ).toBe(isBenign);
    }
  });
});

describe("curated extension telemetry URLs", () => {
  /*
   * The invariant the whole list rests on: every pattern names one host
   * outright. A wildcard anywhere in the host would reach past the endpoint it
   * was written for — `*.1passwordservices.com` covers the certificate
   * revocation endpoint, and blocking that breaks the password manager rather
   * than quieting it.
   */
  test("every pattern is a host-exact https pattern", () => {
    expect(telemetryUrls.length).toBeGreaterThan(0);

    for (const telemetryUrl of telemetryUrls) {
      const host = parseTelemetryUrl(telemetryUrl);

      expect(host).toBeDefined();

      expect(host).not.toContain("*");
    }
  });

  /*
   * And that no pattern reaches a host the product needs. A cancel is
   * indistinguishable from the network being down, so a mistake here is a
   * password manager that quietly stops working.
   */
  test("no pattern covers a host the extensions need", () => {
    for (const productUrl of PRODUCT_URLS) {
      const productHost = new URL(productUrl).host;

      for (const telemetryUrl of telemetryUrls) {
        expect(parseTelemetryUrl(telemetryUrl)).not.toBe(productHost);
      }
    }
  });
});

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

  /*
   * The address bar of the sign-in page is what a user has at hand, so a pasted
   * URL keeps only the host it names.
   */
  test("takes the hostname out of a pasted URL", () => {
    expect(normalizeExtensionSiteHostname("https://sso.okta.com")).toBe("sso.okta.com");
    expect(normalizeExtensionSiteHostname("https://sso.okta.com/app/x?y=1#z")).toBe("sso.okta.com");
    expect(normalizeExtensionSiteHostname("sso.okta.com/app/x")).toBe("sso.okta.com");
  });

  test("refuses an empty entry", () => {
    expect(normalizeExtensionSiteHostname("")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("   ")).toBeUndefined();
  });

  test("refuses a hostname without a dot", () => {
    expect(normalizeExtensionSiteHostname("localhost")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("okta")).toBeUndefined();
  });

  /*
   * A pattern's host is the whole of what the clamp grants, so anything the
   * host part cannot carry is refused rather than dropped: a port, credentials
   * and a scheme the clamp doesn't grant all change what was asked for.
   */
  test("refuses what a hostname cannot carry", () => {
    expect(normalizeExtensionSiteHostname("sso.okta.com:8443")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("user@sso.okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("user:secret@sso.okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("http://sso.okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("sso okta.com")).toBeUndefined();
  });

  /*
   * A user-typed pattern is never written into a manifest: Chromium refuses the
   * whole manifest over one pattern it can't parse, which would take the
   * extension down rather than the entry.
   */
  test("refuses a match pattern of its own", () => {
    expect(normalizeExtensionSiteHostname("*.okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("https://*.okta.com/*")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("<all_urls>")).toBeUndefined();
  });

  test("refuses empty labels", () => {
    expect(normalizeExtensionSiteHostname("sso..okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname(".okta.com")).toBeUndefined();
    expect(normalizeExtensionSiteHostname("okta.com.")).toBeUndefined();
  });
});

describe("getConflictingExtensionIds", () => {
  test("names the other installed password manager", () => {
    expect(
      getConflictingExtensionIds(ONEPASSWORD_EXTENSION_ID, [
        BITWARDEN_EXTENSION_ID,
        ONEPASSWORD_EXTENSION_ID,
      ]),
    ).toEqual([BITWARDEN_EXTENSION_ID]);
  });

  test("names nothing when no other password manager is installed", () => {
    expect(getConflictingExtensionIds(BITWARDEN_EXTENSION_ID, [BITWARDEN_EXTENSION_ID])).toEqual(
      [],
    );
  });

  test("ignores ids outside the catalog", () => {
    expect(getConflictingExtensionIds("unknown", [BITWARDEN_EXTENSION_ID])).toEqual([]);

    expect(getConflictingExtensionIds(BITWARDEN_EXTENSION_ID, ["unknown"])).toEqual([]);
  });
});

describe("getSkippedPasswordManagerIds", () => {
  test("keeps the first in catalog order, whatever order the config lists them in", () => {
    expect(
      getSkippedPasswordManagerIds([BITWARDEN_EXTENSION_ID, ONEPASSWORD_EXTENSION_ID]),
    ).toEqual([BITWARDEN_EXTENSION_ID]);
  });

  test("skips nothing with one password manager", () => {
    expect(getSkippedPasswordManagerIds([BITWARDEN_EXTENSION_ID])).toEqual([]);

    expect(getSkippedPasswordManagerIds([])).toEqual([]);
  });
});
