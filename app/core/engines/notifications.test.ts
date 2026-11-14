import { describe, expect, it } from "vitest";

import { ONE_UNREAD, TWO_UNREAD } from "../fixtures/gmail-feeds.ts";
import type { FeedEntry } from "../records/feed.ts";
import { parseFeed } from "./feed.ts";
import { mailNotice, notifiable } from "./notifications.ts";

const entriesOf = (text: string): readonly FeedEntry[] => {
  const parsed = parseFeed(text);
  return parsed.ok ? parsed.value.entries : [];
};

const two = entriesOf(TWO_UNREAD);
const one = entriesOf(ONE_UNREAD);
const [newest, older] = two;
const subjects = (entries: readonly FeedEntry[]) =>
  entries.map((entry) => entry.subject);

describe(notifiable, () => {
  it("keeps only important mail when asked, and all of it when the Important feed could not be read", () => {
    const important = new Set([older?.id ?? ""]);
    expect([
      subjects(notifiable(two, "all", important)),
      subjects(notifiable(two, "important", important)),
      subjects(notifiable(two, "important", undefined)),
    ]).toStrictEqual([
      ['Q3 & Q4 "plans" – Tom\'s draft', "2024"],
      ["2024"],
      ['Q3 & Q4 "plans" – Tom\'s draft', "2024"],
    ]);
  });
});

describe(mailNotice, () => {
  const shown = {
    labelled: false,
    profileLabel: "Work",
    showSender: true,
    showSubject: true,
    showSummary: true,
  } as const;

  it("puts the subject in the subtitle on macOS and above the snippet elsewhere, naming the profile only for someone with several", () => {
    const [entry] = one;
    expect(
      entry === undefined
        ? []
        : [
            mailNotice(entry, { ...shown, platform: "darwin" }),
            mailNotice(entry, { ...shown, labelled: true, platform: "win32" }),
          ]
    ).toStrictEqual([
      { body: "Are you free at noon", subtitle: "Lunch?", title: "Ann" },
      { body: "Lunch?\nAre you free at noon", title: "[Work] Ann" },
    ]);
  });

  it("titles a notice with the profile when the sender is hidden, and leaves out an empty snippet", () => {
    expect(
      older === undefined || newest === undefined
        ? []
        : [
            mailNotice(older, { ...shown, platform: "linux" }),
            mailNotice(newest, {
              ...shown,
              platform: "darwin",
              showSender: false,
              showSubject: false,
              showSummary: false,
            }),
          ]
    ).toStrictEqual([{ body: "2024", title: "12345" }, { title: "Work" }]);
  });
});
