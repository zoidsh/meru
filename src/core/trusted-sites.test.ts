import { describe, expect, it } from "vitest";

import {
  asksBeforeOpening,
  shownUrl,
  siteName,
  siteOf,
  trustableSite,
  withSite,
  withoutSite,
} from "./trusted-sites.ts";

describe(siteOf, () => {
  it("is the link's origin, as v3 stores a trusted host, port included", () => {
    expect([
      siteOf("https://example.com/a/b?c=d#e"),
      siteOf("http://Example.COM:8080/x"),
      siteOf("https://user:secret@example.org/"),
    ]).toStrictEqual([
      "https://example.com",
      "http://example.com:8080",
      "https://example.org",
    ]);
  });

  it("is nothing for a link that is not a web page's, or does not parse", () => {
    expect([
      siteOf("mailto:someone@example.com"),
      siteOf("file:///etc/hosts"),
      siteOf("not a url"),
    ]).toStrictEqual([undefined, undefined, undefined]);
  });
});

describe(asksBeforeOpening, () => {
  const trusted = ["https://example.com"];

  it("asks for a site not trusted, and not for one trusted, whatever its path", () => {
    expect([
      asksBeforeOpening("https://example.org/x", { confirm: true, trusted }),
      asksBeforeOpening("https://example.com/any/page", {
        confirm: true,
        trusted,
      }),
    ]).toStrictEqual([true, false]);
  });

  it("tells a trusted site from its subdomains and from plain http, as v3 does", () => {
    expect([
      asksBeforeOpening("https://www.example.com/", { confirm: true, trusted }),
      asksBeforeOpening("http://example.com/", { confirm: true, trusted }),
    ]).toStrictEqual([true, true]);
  });

  it("never asks with asking off", () => {
    expect(
      asksBeforeOpening("https://example.org/", { confirm: false, trusted })
    ).toBeFalsy();
  });
});

describe(withSite, () => {
  it("adds a site at the end once, and removes it", () => {
    const added = withSite(
      withSite(["https://a.example"], "https://b.example"),
      "https://b.example"
    );

    expect([added, withoutSite(added, "https://a.example")]).toStrictEqual([
      ["https://a.example", "https://b.example"],
      ["https://b.example"],
    ]);
  });
});

describe(siteName, () => {
  it("names a site by its host", () => {
    expect([
      siteName("https://example.com"),
      siteName("http://example.com:8080"),
    ]).toStrictEqual(["example.com", "example.com:8080"]);
  });
});

describe(shownUrl, () => {
  it("shows a link of up to 256 characters whole, and cuts a longer one to 256", () => {
    const long = `https://example.com/${"a".repeat(300)}`;

    expect([
      shownUrl("https://example.com/"),
      shownUrl(long).length,
      shownUrl(long).endsWith("…"),
    ]).toStrictEqual(["https://example.com/", 256, true]);
  });
});

describe(trustableSite, () => {
  it("is the link's site, but none for a link still wrapped in Google's redirect", () => {
    expect([
      trustableSite("https://example.com/page"),
      trustableSite("https://www.google.com/url?q=javascript:alert(1)"),
      trustableSite("https://www.google.com/search?q=meru"),
    ]).toStrictEqual([
      "https://example.com",
      undefined,
      "https://www.google.com",
    ]);
  });
});
