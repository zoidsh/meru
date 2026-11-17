import { describe, expect, it } from "vitest";

import {
  GMAIL_HASH_MAX_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  isGmailHash,
  normalizeQuery,
  searchHash,
  searchQueryOf,
} from "./gmail-hash.ts";

const INBOX = "https://mail.google.com/mail/u/0/";

/** Queries that a hash, a URL or a script built from them would misread. */
const HOSTILE: readonly [string, string][] = [
  ['subject:"out of office"', "#search/subject%3A%22out%20of%20office%22"],
  ['from:a@b.com "x y"', "#search/from%3Aa%40b.com%20%22x%20y%22"],
  ["'single'", "#search/'single'"],
  ['"\\', "#search/%22%5C"],
  [
    '"; location = "https://example.com',
    "#search/%22%3B%20location%20%3D%20%22https%3A%2F%2Fexample.com",
  ],
  ["filename:report/final", "#search/filename%3Areport%2Ffinal"],
  ["#urgent & new", "#search/%23urgent%20%26%20new"],
  ["c++", "#search/c%2B%2B"],
  ["100%", "#search/100%25"],
  ["%22", "#search/%2522"],
  ["what?", "#search/what%3F"],
  ["a\nb", "#search/a%0Ab"],
  ["</script><img src=x>", "#search/%3C%2Fscript%3E%3Cimg%20src%3Dx%3E"],
  ["مرحبا", "#search/%D9%85%D8%B1%D8%AD%D8%A8%D8%A7"],
  ["label:日本", "#search/label%3A%E6%97%A5%E6%9C%AC"],
  ["‮gnp.exe", "#search/%E2%80%AEgnp.exe"],
];

describe(searchHash, () => {
  it.each(HOSTILE)("keeps %j one segment of the hash", (query, hash) => {
    expect(searchHash(query)).toBe(hash);
  });

  it.each(HOSTILE)("reads %j back from a page at its hash", (query) => {
    expect(searchQueryOf(`${INBOX}${searchHash(query)}`)).toBe(query.trim());
  });
});

describe(searchQueryOf, () => {
  it("reads Gmail's own spelling, a plus for a space", () => {
    expect(searchQueryOf(`${INBOX}#search/in%3Asent+has%3Aattachment`)).toBe(
      "in:sent has:attachment"
    );
    expect(searchQueryOf(`${INBOX}#search/c%2B%2B`)).toBe("c++");
  });

  it("reads a quote the URL parser encoded, or one it left as typed", () => {
    expect(searchQueryOf(`${INBOX}#search/subject:"out of office"`)).toBe(
      'subject:"out of office"'
    );
  });

  it("leaves off a message opened from the search and a parameter after it", () => {
    expect(searchQueryOf(`${INBOX}#search/budget/FMfcgzQXJWDsKmHrLrmNs`)).toBe(
      "budget"
    );
    expect(searchQueryOf(`${INBOX}#search/budget?compose=new`)).toBe("budget");
  });

  it.each([
    `${INBOX}#inbox`,
    `${INBOX}#label/search`,
    `${INBOX}?q=search#inbox`,
    `${INBOX}#search/`,
    `${INBOX}#search/+++`,
    `${INBOX}#search/%E0%A4%A`,
    `${INBOX}#search/%`,
    "not a url",
  ])("finds no search at %s", (url) => {
    expect(searchQueryOf(url)).toBeUndefined();
  });

  it("finds none longer than a saved search holds", () => {
    const longest = "a".repeat(SEARCH_QUERY_MAX_LENGTH);

    expect(searchQueryOf(`${INBOX}${searchHash(longest)}`)).toBe(longest);
    expect(
      searchQueryOf(`${INBOX}${searchHash(`${longest}a`)}`)
    ).toBeUndefined();
  });
});

describe(normalizeQuery, () => {
  it("trims, and refuses an empty, overlong or ill-formed query", () => {
    expect(normalizeQuery("  from:me  ")).toBe("from:me");
    expect(
      [
        normalizeQuery(" \n "),
        normalizeQuery("a".repeat(SEARCH_QUERY_MAX_LENGTH + 1)),
        normalizeQuery("x\uD800"),
        normalizeQuery("\uDC00x"),
      ].every((query) => query === undefined)
    ).toBeTruthy();
  });
});

describe(isGmailHash, () => {
  it.each([
    "中".repeat(SEARCH_QUERY_MAX_LENGTH),
    '"'.repeat(SEARCH_QUERY_MAX_LENGTH),
    "😀".repeat(SEARCH_QUERY_MAX_LENGTH / 2),
  ])(
    "takes the search for the longest query %#, however it encodes",
    (query) => {
      expect(isGmailHash(searchHash(query))).toBeTruthy();
    }
  );

  it("takes a hash of at most its length", () => {
    expect(isGmailHash("#settings")).toBeTruthy();
    expect(isGmailHash(searchHash('"x"'))).toBeTruthy();
    expect(
      isGmailHash(`#${"a".repeat(GMAIL_HASH_MAX_LENGTH - 1)}`)
    ).toBeTruthy();
  });

  it.each([
    `#${"a".repeat(GMAIL_HASH_MAX_LENGTH)}`,
    "settings",
    "https://example.com/#x",
    "data:text/html,x",
    "",
    undefined,
    ["#inbox"],
    { toString: () => "#inbox" },
  ])("refuses %j", (value) => {
    expect(isGmailHash(value)).toBeFalsy();
  });
});
