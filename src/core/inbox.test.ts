import { describe, expect, it } from "vitest";

import type { FeedEntry } from "./feed.ts";
import {
  INBOX_ROW_CAP,
  afterPoll,
  dateForm,
  inboxKey,
  inboxRows,
} from "./inbox.ts";
import type { PendingAction } from "./inbox.ts";

const entry = (id: string, issued: number): FeedEntry => ({
  id,
  link: `https://mail.google.com/mail/u/0?message_id=${id}`,
  subject: `Subject ${id}`,
  summary: `Summary ${id}`,
  senderName: `Sender ${id}`,
  senderAddress: `${id}@example.com`,
  issued,
});

const ids = (rows: ReturnType<typeof inboxRows>) =>
  rows.map((row) => `${row.profileId}/${row.messageId}`);

describe(inboxRows, () => {
  it("merges every profile's mail newest first, each tie in the profiles' order and then the feed's", () => {
    expect(
      ids(
        inboxRows(
          [
            {
              id: "a",
              entries: [entry("a3", 30), entry("a1", 10), entry("a2", 10)],
            },
            { id: "b", entries: [entry("b4", 40), entry("b1", 10)] },
          ],
          new Set()
        )
      )
    ).toStrictEqual(["b/b4", "a/a3", "a/a1", "a/a2", "b/b1"]);
  });

  it("carries what a row shows and no link", () => {
    const [row] = inboxRows(
      [{ id: "a", entries: [entry("a1", 10)] }],
      new Set()
    );

    expect(row).toStrictEqual({
      profileId: "a",
      messageId: "a1",
      senderName: "Sender a1",
      senderAddress: "a1@example.com",
      subject: "Subject a1",
      summary: "Summary a1",
      issued: 10,
    });
  });

  it("leaves out a hidden message of its own profile only", () => {
    expect(
      ids(
        inboxRows(
          [
            { id: "a", entries: [entry("ff", 20)] },
            { id: "b", entries: [entry("ff", 10)] },
          ],
          new Set([inboxKey("a", "ff")])
        )
      )
    ).toStrictEqual(["b/ff"]);
  });

  it("keeps the newest rows up to the cap", () => {
    const profiles = Array.from({ length: 30 }, (_unused, profile) => ({
      id: `p${profile}`,
      entries: Array.from({ length: 20 }, (_entry, index) =>
        entry(`m${index}`, profile * 20 + index)
      ),
    }));
    const rows = inboxRows(profiles, new Set());

    expect(rows).toHaveLength(INBOX_ROW_CAP);
    expect(rows[0]?.issued).toBe(599);
    expect(rows.at(-1)?.issued).toBe(600 - INBOX_ROW_CAP);
  });
});

describe(afterPoll, () => {
  const pending = new Map<string, PendingAction>([
    [inboxKey("a", "01"), { phase: "running", profileId: "a" }],
    [inboxKey("a", "02"), { phase: "done", profileId: "a", at: 100 }],
    [inboxKey("a", "03"), { phase: "done", profileId: "a", at: 100 }],
    [inboxKey("b", "04"), { phase: "done", profileId: "b", at: 100 }],
  ]);

  it("keeps a done action's row hidden through a poll that started before it ended", () => {
    expect([
      ...afterPoll(pending, "a", 50, new Set(["01", "02"])).keys(),
    ]).toStrictEqual(["a/01", "a/02", "b/04"]);
  });

  it("lets a poll that started after the action decide, and keeps the running one", () => {
    expect([
      ...afterPoll(pending, "a", 150, new Set(["01", "02", "03"])).keys(),
    ]).toStrictEqual(["a/01", "b/04"]);
  });

  it("forgets what the feed no longer lists, so it holds no more than the feeds do", () => {
    expect([...afterPoll(pending, "a", 50, new Set()).keys()]).toStrictEqual([
      "a/01",
      "b/04",
    ]);
  });
});

describe(dateForm, () => {
  const now = new Date(2026, 10, 17, 14, 0);

  it("writes the time today, the day this year and the date before it, by the local clock", () => {
    expect(
      [
        new Date(2026, 10, 17, 0, 1),
        new Date(2026, 10, 16, 23, 59),
        new Date(2026, 0, 1),
        new Date(2025, 11, 31, 23, 59),
        new Date(2025, 10, 17, 14),
      ].map((date) => dateForm(date.getTime(), now))
    ).toStrictEqual(["time", "day", "day", "date", "date"]);
  });
});
