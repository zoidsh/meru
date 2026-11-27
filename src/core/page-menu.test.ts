import { describe, expect, it } from "vitest";

import type { MenuEntry } from "./context-menu.ts";
import {
  emailAddressOf,
  lookUpText,
  pageMenu,
  searchUrl,
  suggestionOf,
} from "./page-menu.ts";
import type { PageClick, PageHost, PageMenuItemId } from "./page-menu.ts";
import type { Platform } from "./platform.ts";

const click = (change: Partial<PageClick> = {}): PageClick => ({
  editable: false,
  selection: "",
  misspelledWord: "",
  suggestions: [],
  linkUrl: "",
  edit: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true },
  ...change,
});

const GMAIL: PageHost = {
  kind: "tab",
  gmail: true,
  url: "https://mail.google.com/mail/u/0/",
};
const CALENDAR: PageHost = {
  kind: "tab",
  gmail: false,
  url: "https://calendar.google.com/r/week",
};
const CHILD: PageHost = { kind: "child-window" };

/** A menu as text: each item's id, " off" while disabled, "|" a line. */
const shown = (menu: readonly MenuEntry<PageMenuItemId>[]) =>
  menu
    .map((entry) =>
      entry.kind === "separator"
        ? "|"
        : `${entry.id}${entry.enabled ? "" : " off"}`
    )
    .join(", ");

const FIELD = {
  editable: true,
  edit: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
};

describe("a page's context menu", () => {
  it.each<[string, Partial<PageClick>, PageHost, Platform, string]>([
    ["plain text in Gmail on macOS", {}, GMAIL, "darwin", "inspectElement"],
    [
      "plain text in Gmail on Windows",
      {},
      GMAIL,
      "win32",
      "selectAll, |, inspectElement",
    ],
    [
      "plain text in another app on Linux",
      {},
      CALENDAR,
      "linux",
      "selectAll, |, copyUrl, openInBrowser, |, inspectElement",
    ],
    [
      "a selection on macOS",
      { selection: "standup", edit: { ...click().edit, canCopy: true } },
      GMAIL,
      "darwin",
      "lookUp, |, searchWithGoogle, |, copy, |, inspectElement",
    ],
    [
      "white space macOS selected between words, as nothing selected",
      { selection: " \n", edit: { ...click().edit, canCopy: true } },
      GMAIL,
      "darwin",
      "inspectElement",
    ],
    [
      "a selection on Windows, with no Look Up",
      { selection: "standup", edit: { ...click().edit, canCopy: true } },
      GMAIL,
      "win32",
      "searchWithGoogle, |, copy, selectAll, |, inspectElement",
    ],
    [
      "an empty field",
      { ...FIELD, edit: { ...FIELD.edit, canCut: false, canCopy: false } },
      GMAIL,
      "darwin",
      "cut off, copy off, paste, pasteAndMatchStyle, |, inspectElement",
    ],
    [
      "a field whose selection Chromium cannot copy",
      { ...FIELD, selection: "x", edit: { ...FIELD.edit, canCopy: false } },
      GMAIL,
      "darwin",
      "lookUp, |, searchWithGoogle, |, cut, copy off, paste, pasteAndMatchStyle, |, inspectElement",
    ],
    [
      "a field with nothing to paste",
      { ...FIELD, edit: { ...FIELD.edit, canPaste: false } },
      GMAIL,
      "linux",
      "cut off, copy off, paste off, pasteAndMatchStyle off, selectAll, |, inspectElement",
    ],
    [
      "a misspelt word in a field, with suggestions",
      {
        ...FIELD,
        selection: "teh",
        misspelledWord: "teh",
        suggestions: ["the", "ten"],
      },
      GMAIL,
      "darwin",
      "suggestion-0, suggestion-1, |, learnSpelling, |, lookUp, |, searchWithGoogle, |, cut, copy, paste, pasteAndMatchStyle, |, inspectElement",
    ],
    [
      "a misspelt word in a field, without suggestions",
      { ...FIELD, misspelledWord: "zzxq" },
      GMAIL,
      "win32",
      "noGuesses off, |, learnSpelling, |, cut off, copy off, paste, pasteAndMatchStyle, selectAll, |, inspectElement",
    ],
    [
      "a misspelt word outside a field",
      { misspelledWord: "teh", suggestions: ["the"] },
      GMAIL,
      "darwin",
      "inspectElement",
    ],
    [
      "a link",
      { linkUrl: "https://example.com/" },
      GMAIL,
      "darwin",
      "copyLinkAddress, |, inspectElement",
    ],
    [
      "a selection on a link, with no Look Up",
      { linkUrl: "https://example.com/", selection: "Example" },
      GMAIL,
      "darwin",
      "searchWithGoogle, |, copy off, |, copyLinkAddress, |, inspectElement",
    ],
    [
      "a mailto: link",
      { linkUrl: "mailto:ada@example.com?subject=Hi" },
      GMAIL,
      "darwin",
      "copyEmailAddress, |, copyLinkAddress, |, inspectElement",
    ],
    [
      "an image",
      { image: { url: "https://lh3.googleusercontent.com/a.png" } },
      GMAIL,
      "darwin",
      "saveImageAs, copyImage, copyImageAddress, |, inspectElement",
    ],
    [
      "an image Chromium gives no address",
      { image: { url: "" } },
      GMAIL,
      "darwin",
      "saveImageAs, copyImage, copyImageAddress off, |, inspectElement",
    ],
    [
      "an image inside a link",
      {
        image: { url: "https://lh3.googleusercontent.com/a.png" },
        linkUrl: "https://example.com/",
      },
      GMAIL,
      "darwin",
      "saveImageAs, copyImage, copyImageAddress, |, inspectElement",
    ],
    [
      "an image inside a mailto: link",
      {
        image: { url: "https://lh3.googleusercontent.com/a.png" },
        linkUrl: "mailto:ada@example.com",
      },
      CALENDAR,
      "darwin",
      "saveImageAs, copyImage, copyImageAddress, copyEmailAddress, |, copyUrl, openInBrowser, |, inspectElement",
    ],
    [
      "a link in a child window, which has no tab items",
      { linkUrl: "https://example.com/" },
      CHILD,
      "linux",
      "selectAll, |, copyLinkAddress, |, inspectElement",
    ],
    [
      "another app's page that is not on the web",
      {},
      { kind: "tab", gmail: false, url: "about:blank" },
      "darwin",
      "copyUrl, openInBrowser off, |, inspectElement",
    ],
  ])("on %s", (_case, change, host, platform, expected) => {
    expect(shown(pageMenu(click(change), host, platform))).toBe(expected);
  });

  it("names each suggestion by its place in Chromium's list", () => {
    const misspelt = click({ suggestions: ["the", "ten"] });

    expect(
      ["suggestion-0", "suggestion-1", "suggestion-2", "copy"].map((id) =>
        suggestionOf(misspelt, id as PageMenuItemId)
      )
    ).toStrictEqual(["the", "ten", undefined, undefined]);
  });
});

describe("what the items take", () => {
  it("quotes a selection of 25 graphemes or fewer whole, trimmed, and cuts a longer one to 25 and an ellipsis", () => {
    expect([
      lookUpText("  standup  "),
      lookUpText("a".repeat(25)),
      lookUpText(`${"👩‍👩‍👧".repeat(26)}`),
    ]).toStrictEqual(["standup", "a".repeat(25), `${"👩‍👩‍👧".repeat(25)}…`]);
  });

  it("copies a mailto: link's address without its scheme or query, decoded", () => {
    expect([
      emailAddressOf("mailto:ada@example.com?subject=Hi"),
      emailAddressOf("MAILTO:ada%2Bmeru@example.com"),
      emailAddressOf("mailto:%E0%A4%A"),
      emailAddressOf("https://example.com/"),
    ]).toStrictEqual([
      "ada@example.com",
      "ada+meru@example.com",
      "%E0%A4%A",
      undefined,
    ]);
  });

  it("searches Google for the selection as typed", () => {
    expect(searchUrl("a & b?")).toBe(
      "https://www.google.com/search?q=a+%26+b%3F"
    );
  });
});
