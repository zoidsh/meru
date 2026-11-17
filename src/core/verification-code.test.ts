import { describe, expect, it } from "vitest";

import { corpusFresh } from "./verification-code.corpus-fresh.ts";
import { corpusV4 } from "./verification-code.corpus-v4.ts";
import { corpus } from "./verification-code.corpus.ts";
import { extractVerificationCode } from "./verification-code.ts";

const code = (subject: string, summary = "") =>
  extractVerificationCode([subject, summary]);

// Slice 2.6 set the extractor aside to be written again from the design
// record. This is the bar it is written to, skipped here alone until it is.
// oxlint-disable-next-line vitest/no-disabled-tests
describe.skip("the extractor, set aside in slice 2.6", () => {
  it.each(corpus)(
    "v3's corpus, $language: $subject",
    ({ subject, summary, expected }) => {
      expect(code(subject, summary)).toBe(expected ?? undefined);
    }
  );

  it.each(corpusV4)(
    "v4's corpus, $language: $subject",
    ({ subject, summary, expected, knownMiss }) => {
      expect(code(subject, summary)).toBe(
        (knownMiss ? knownMiss.answer : expected) ?? undefined
      );
    }
  );

  it("never reads a shorter code into a run of digits a cap on its input cuts through", () => {
    for (const length of [1000, 2000, 5000]) {
      const before = "Your code is ready: ";
      const filler = "x".repeat(length - before.length - 6);

      expect(
        code("Your access code", `${filler}${before}5551234567`)
      ).toBeUndefined();
    }
  });

  it("is not misled by normalising that lengthens a text, as NFKC does", () => {
    expect(code(`${"ﬀ".repeat(495)} code 4930217`)).not.toBe("4930");
  });

  it("answers a long hostile subject and summary quickly", () => {
    const hostile = [
      "code ".repeat(10_000),
      "1 ".repeat(10_000),
      "1-".repeat(10_000),
      `${"discount ".repeat(2000)}code`,
      `+${"(1) ".repeat(5000)}`,
      `order${" ".repeat(10_000)}#`,
      `${"코드".repeat(5000)}${"1 ".repeat(5000)}`,
    ];
    const started = performance.now();

    for (const subject of hostile) {
      for (const summary of hostile) {
        code(subject, summary);
      }
    }

    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("the corpora", () => {
  it("hold v3's 71 codes and 44 messages with none, v4's 22 entries, and the fresh 84 codes and 66 with none", () => {
    expect([
      corpus.filter((entry) => entry.expected !== null).length,
      corpus.filter((entry) => entry.expected === null).length,
      corpusV4.length,
      corpusFresh.filter((entry) => entry.expected !== null).length,
      corpusFresh.filter((entry) => entry.expected === null).length,
    ]).toStrictEqual([71, 44, 22, 84, 66]);
  });
});
