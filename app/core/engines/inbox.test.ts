import { describe, expect, it } from "vitest";

import { ONE_UNREAD, TWO_UNREAD } from "../fixtures/gmail-feeds.ts";
import type { FeedEntry } from "../records/feed.ts";
import { parseFeed } from "./feed.ts";
import {
  EMPTY_FEED_MEMORY,
  FEED_SLACK,
  feedDelay,
  feedUrl,
  mailNotice,
  notifiable,
  readFeed,
} from "./inbox.ts";

const entriesOf = (text: string): readonly FeedEntry[] => {
  const parsed = parseFeed(text);
  return parsed.ok ? parsed.value.entries : [];
};

const two = entriesOf(TWO_UNREAD);
const one = entriesOf(ONE_UNREAD);
const [newest, older] = two;
const subjects = (entries: readonly FeedEntry[]) =>
  entries.map((entry) => entry.subject);

const reads = (
  ...steps: readonly (readonly [readonly FeedEntry[], number])[]
): string[][] => {
  let memory = EMPTY_FEED_MEMORY;
  return steps.map(([entries, readAt]) => {
    const read = readFeed(memory, entries, readAt);
    ({ memory } = read);
    return subjects(read.arrived);
  });
};

const at = (iso: string) => Date.parse(iso);

describe(readFeed, () => {
  it("calls nothing new on the first read and every later arrival new once, oldest first", () => {
    const noon = at("2026-11-13T08:01:00Z");
    expect(
      reads(
        [one, noon],
        [[...two, ...one], noon + 30_000],
        [two, noon + 60_000]
      )
    ).toStrictEqual([[], ["2024", 'Q3 & Q4 "plans" – Tom\'s draft'], []]);
  });

  it("never calls new what was listed before, nor what was issued long before the last read, as mail marked unread again is", () => {
    const later = at("2026-11-13T09:00:00Z") + FEED_SLACK * 2;
    expect([
      reads([two, later], [[], later + 30_000], [two, later + 60_000]),
      reads([[], later], [one, later + 30_000]),
    ]).toStrictEqual([
      [[], [], []],
      [[], []],
    ]);
  });
});

describe(readFeed, () => {
  it("forgets an entry once it was issued too long before a read to be called new again", () => {
    const first = readFeed(EMPTY_FEED_MEMORY, two, at("2026-11-13T09:00:00Z"));
    const later = readFeed(first.memory, [], at("2026-11-14T09:00:00Z"));
    expect([
      ...first.memory.seen.keys(),
      ...later.memory.seen.keys(),
    ]).toStrictEqual([newest?.id]);
  });
});

describe(feedDelay, () => {
  it("doubles from the interval with each failure, up to five minutes", () => {
    expect([0, 1, 2, 3, 4, 10].map(feedDelay)).toStrictEqual([
      30_000, 60_000, 120_000, 240_000, 300_000, 300_000,
    ]);
  });
});

describe(feedUrl, () => {
  it("adds the label as a path segment and the time as a cache-buster", () => {
    expect([
      feedUrl("https://mail.google.com/mail/u/0/feed/atom", 7),
      feedUrl("https://mail.google.com/mail/u/0/feed/atom", 7, "^iim"),
    ]).toStrictEqual([
      "https://mail.google.com/mail/u/0/feed/atom?t=7",
      "https://mail.google.com/mail/u/0/feed/atom/^iim?t=7",
    ]);
  });
});

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
