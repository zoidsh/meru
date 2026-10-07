import { describe, expect, test } from "bun:test";
import { matchesEventFilters, matchesUrlFilter } from "./url-filter";

const URL_UNDER_TEST = "https://www.Example.com/login/form.html?step=2&next=home#top";

describe("matchesUrlFilter", () => {
  test("an empty filter matches everything", () => {
    expect(matchesUrlFilter(URL_UNDER_TEST, {})).toBe(true);
  });

  test("hosts compare lowercased, and hostContains with an implicit leading dot", () => {
    expect(matchesUrlFilter(URL_UNDER_TEST, { hostEquals: "www.example.com" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { hostEquals: "WWW.EXAMPLE.COM" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { hostEquals: "example.com" })).toBe(false);
    expect(matchesUrlFilter(URL_UNDER_TEST, { hostSuffix: "example.com" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { hostPrefix: "www." })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { hostContains: ".www" })).toBe(true);
    expect(matchesUrlFilter("https://example.com/", { hostContains: ".example." })).toBe(true);
    expect(matchesUrlFilter("https://myexample.com/", { hostContains: ".example." })).toBe(false);
  });

  test("path and query compare without the fragment, the query without its question mark", () => {
    expect(matchesUrlFilter(URL_UNDER_TEST, { pathEquals: "/login/form.html" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { pathPrefix: "/login" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { pathSuffix: ".html" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { pathContains: "form" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { queryEquals: "step=2&next=home" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { queryPrefix: "step=" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { querySuffix: "home" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { queryContains: "top" })).toBe(false);
  });

  test("whole-URL criteria see the canonical URL without its fragment or default port", () => {
    expect(
      matchesUrlFilter("https://example.com:443/a#frag", { urlEquals: "https://example.com/a" }),
    ).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { urlSuffix: "home" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { urlPrefix: "https://www.example.com/" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { urlContains: "#top" })).toBe(false);
  });

  test("regular expressions search the URL, originAndPathMatches without the query", () => {
    expect(matchesUrlFilter(URL_UNDER_TEST, { urlMatches: "step=\\d" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { originAndPathMatches: "step=\\d" })).toBe(false);
    expect(matchesUrlFilter(URL_UNDER_TEST, { originAndPathMatches: "form\\.html$" })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { urlMatches: "(" })).toBe(false);
  });

  test("schemes and ports, a default port counting as the URL's own", () => {
    expect(matchesUrlFilter(URL_UNDER_TEST, { schemes: ["http", "https"] })).toBe(true);
    expect(matchesUrlFilter(URL_UNDER_TEST, { schemes: ["http"] })).toBe(false);
    expect(matchesUrlFilter(URL_UNDER_TEST, { ports: [443] })).toBe(true);
    expect(matchesUrlFilter("http://127.0.0.1:5173/", { ports: [80, [5000, 6000]] })).toBe(true);
    expect(matchesUrlFilter("http://127.0.0.1:7000/", { ports: [80, [5000, 6000]] })).toBe(false);
    expect(matchesUrlFilter("chrome-extension://abc/popup.html", { ports: [443] })).toBe(false);
  });

  test("every criterion has to hold", () => {
    expect(matchesUrlFilter(URL_UNDER_TEST, { hostSuffix: "example.com", pathPrefix: "/x" })).toBe(
      false,
    );
  });

  test("a filter it cannot evaluate matches nothing, and so does a URL it cannot parse", () => {
    expect(matchesUrlFilter(URL_UNDER_TEST, { cidrBlocks: ["10.0.0.0/8"] })).toBe(false);
    expect(matchesUrlFilter("not a url", {})).toBe(false);
  });
});

describe("matchesEventFilters", () => {
  test("no filters, or no url list, or an empty one, matches every URL, as in Chrome", () => {
    expect(matchesEventFilters(URL_UNDER_TEST, undefined)).toBe(true);
    expect(matchesEventFilters(URL_UNDER_TEST, {})).toBe(true);
    expect(matchesEventFilters(URL_UNDER_TEST, { url: [] })).toBe(true);
  });

  test("any one filter matching is enough", () => {
    expect(
      matchesEventFilters(URL_UNDER_TEST, {
        url: [{ hostEquals: "other.example" }, { pathPrefix: "/login" }],
      }),
    ).toBe(true);

    expect(
      matchesEventFilters(URL_UNDER_TEST, {
        url: [{ hostEquals: "other.example" }, { schemes: ["http"] }],
      }),
    ).toBe(false);
  });
});
