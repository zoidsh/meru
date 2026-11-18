import { describe, expect, it } from "vitest";

import { corpusFresh } from "./verification-code.corpus-fresh.test-data.ts";
import { corpusHeldOut } from "./verification-code.corpus-heldout.test-data.ts";
import { corpusV4 } from "./verification-code.corpus-v4.test-data.ts";
import type { V4CorpusEntry } from "./verification-code.corpus-v4.test-data.ts";
import { corpus } from "./verification-code.corpus.test-data.ts";
import type { CorpusEntry } from "./verification-code.corpus.test-data.ts";
import {
  MAX_TEXT_LENGTH,
  extractVerificationCode,
} from "./verification-code.ts";

const code = (subject: string, summary = "") =>
  extractVerificationCode([subject, summary]);

const answerOf = ({ subject, summary }: { subject: string; summary: string }) =>
  code(subject, summary) ?? null;

/** The answer a test asserts: the right one, or the known wrong one. */
const assertedOf = ({
  expected,
  knownMiss,
  knownFalsePositive,
}: V4CorpusEntry) =>
  (knownMiss ? knownMiss.answer : (knownFalsePositive?.answer ?? expected)) ??
  undefined;

const tally = <Entry extends CorpusEntry>(
  entries: readonly Entry[],
  answer: (entry: Entry) => string | null
) => {
  const counts = { found: 0, falsePositives: 0, wrong: 0 };

  for (const entry of entries) {
    const given = answer(entry);

    if (given === null) {
      continue;
    }
    if (entry.expected === null) {
      counts.falsePositives += 1;
    } else if (given === entry.expected) {
      counts.found += 1;
    } else {
      counts.wrong += 1;
    }
  }

  return counts;
};

const fill = (unit: string, length: number) =>
  unit.repeat(Math.floor(length / unit.length));

describe("the extractor", () => {
  it.each(corpus)(
    "v3's corpus, $language: $subject",
    ({ subject, summary, expected }) => {
      expect(code(subject, summary)).toBe(expected ?? undefined);
    }
  );

  it.each(corpusV4)("v4's corpus, $language: $subject", (entry) => {
    expect(answerOf(entry) ?? undefined).toBe(assertedOf(entry));
  });

  it.each(corpusFresh)("the fresh corpus, $language: $subject", (entry) => {
    expect(answerOf(entry) ?? undefined).toBe(assertedOf(entry));
  });

  it.each(corpusHeldOut)(
    "the held-out corpus, $language: $subject",
    (entry) => {
      expect(answerOf(entry) ?? undefined).toBe(assertedOf(entry));
    }
  );

  it.each([
    ["fresh", corpusFresh],
    ["held-out", corpusHeldOut],
  ] as const)(
    "finds at least as many of the %s codes as v3 did, with no more false positives and never wrong digits",
    (_name, entries: readonly (CorpusEntry & { v3: string | null })[]) => {
      const ours = tally(entries, answerOf);
      const v3 = tally(entries, (entry) => entry.v3);

      expect(ours.found).toBeGreaterThanOrEqual(v3.found);
      expect(ours.falsePositives).toBeLessThanOrEqual(v3.falsePositives);
      expect(ours.wrong).toBe(0);
    }
  );

  it("does not let a code word in the other text alone lift a bare four-digit number", () => {
    expect(code("Your code", "4829")).toBeUndefined();
    expect(code("4829", "Your code")).toBeUndefined();
  });

  it("does not read a text longer than the limit after normalising, and reads one at it", () => {
    const at = `Your code is 482910 ${"x".repeat(MAX_TEXT_LENGTH - 20)}`;

    expect(at).toHaveLength(MAX_TEXT_LENGTH);
    expect(code(at)).toBe("482910");
    expect(code(`${at}x`)).toBeUndefined();
    expect(code("Your code", `${at}x`)).toBeUndefined();
  });

  it("measures the limit after normalising, which can lengthen a text", () => {
    const subject = `${"ﬀ".repeat(495)} code 4930217`;

    expect(subject.length).toBeLessThan(MAX_TEXT_LENGTH);
    expect(code(subject)).toBeUndefined();
  });

  it("reads one text when the other is too long to", () => {
    expect(code("x".repeat(5000), "Your code is 482910")).toBe("482910");
  });

  it("never reads a shorter code into a long run of digits", () => {
    for (const length of [1000, 2000, 5000]) {
      const before = "Your code is ready: ";
      const filler = "x".repeat(length - before.length - 6);

      expect(
        code("Your access code", `${filler}${before}5551234567`)
      ).toBeUndefined();
    }
  });

  it("answers hostile subjects and summaries quickly, at the limit and at a megabyte", () => {
    const shapes = [
      "code ",
      "1 ",
      "1-",
      "code 4829. ",
      "discount code ",
      "(1) +",
      "order #",
      "코드1 ",
      "ﬀ",
      "Promo-",
    ];
    const hostile = shapes.flatMap((shape) => [
      fill(shape, MAX_TEXT_LENGTH),
      fill(shape, 1024 * 1024),
    ]);
    const started = performance.now();

    for (const subject of hostile) {
      for (const summary of hostile) {
        code(subject, summary);
      }
    }

    // A pattern that backtracks takes minutes here; a hosted runner takes one
    // to two seconds on a slow day, so the bound sits well above that.
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  it("takes well under a millisecond a message on the corpora", () => {
    const messages = [...corpus, ...corpusV4, ...corpusFresh, ...corpusHeldOut];
    const started = performance.now();

    for (const message of messages) {
      answerOf(message);
    }

    expect((performance.now() - started) / messages.length).toBeLessThan(1);
  });
});

describe("the corpora", () => {
  it("hold v3's 71 codes and 44 messages with none, v4's 22 entries, the fresh 84 codes and 66 with none, and the held-out 60 and 60", () => {
    expect([
      corpus.filter((entry) => entry.expected !== null).length,
      corpus.filter((entry) => entry.expected === null).length,
      corpusV4.length,
      corpusFresh.filter((entry) => entry.expected !== null).length,
      corpusFresh.filter((entry) => entry.expected === null).length,
      corpusHeldOut.filter((entry) => entry.expected !== null).length,
      corpusHeldOut.filter((entry) => entry.expected === null).length,
    ]).toStrictEqual([71, 44, 22, 84, 66, 60, 60]);
  });
});
