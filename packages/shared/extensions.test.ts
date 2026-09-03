import { describe, expect, test } from "bun:test";
import { curatedExtensions } from "./extensions";

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
