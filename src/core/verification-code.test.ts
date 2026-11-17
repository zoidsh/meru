import { describe, expect, it } from "vitest";

import { corpus } from "./verification-code.corpus.ts";
import {
  MOST_READ,
  collectCandidates,
  extractVerificationCode,
  normalizeText,
} from "./verification-code.ts";

const digitsOf = (text: string) =>
  collectCandidates(text).map((candidate) => candidate.digits);

const code = (subject: string, summary = "") =>
  extractVerificationCode([subject, summary]);

describe(normalizeText, () => {
  it.each([
    ["full-width", "４９３０２１"],
    ["Arabic-Indic", "٤٩٣٠٢١"],
    ["Extended Arabic-Indic", "۴۹۳۰۲۱"],
    ["Devanagari", "४९३०२१"],
  ])("folds %s digits to ASCII", (_script, digits) => {
    expect(normalizeText(digits)).toBe("493021");
  });

  it("leaves ASCII text as it is", () => {
    expect(normalizeText("Your code is 493021")).toBe("Your code is 493021");
  });

  it("keeps a full-width comma from welding a code to the number after it", () => {
    expect(digitsOf(normalizeText("验证码493021，10分钟内有效"))).toStrictEqual(
      ["493021"]
    );
  });
});

describe(collectCandidates, () => {
  it("collects a solid run of four to eight digits", () => {
    for (const digits of ["4930", "49302", "493021", "4930217", "49302176"]) {
      expect(digitsOf(`code ${digits}`)).toStrictEqual([digits]);
    }
  });

  it("collects the groupings a code is written in, without separators", () => {
    expect(digitsOf("code 493 021")).toStrictEqual(["493021"]);
    expect(digitsOf("code 4930-2176")).toStrictEqual(["49302176"]);
    expect(digitsOf("code 49 30 21")).toStrictEqual(["493021"]);
    expect(digitsOf("code 49-30-21-76")).toStrictEqual(["49302176"]);
  });

  it("rejects other groupings, short runs and long ones", () => {
    for (const text of [
      "code 493 0217",
      "code 4 93021",
      "code 493",
      "code 49 30",
      "call 5551234567 now",
      "tracking 1234 5678 9012",
    ]) {
      expect(collectCandidates(text)).toStrictEqual([]);
    }
  });

  it("rejects a run glued to letters or part of a larger number", () => {
    for (const text of [
      "code AB493021",
      "code 493021px",
      "code 12.493021",
      "code 493021.75",
    ]) {
      expect(collectCandidates(text)).toStrictEqual([]);
    }
  });

  it("tells where each candidate is", () => {
    expect(collectCandidates("Your code is 493021")).toStrictEqual([
      { digits: "493021", groups: ["493021"], start: 13, end: 19 },
    ]);
  });
});

describe("the code-word gate", () => {
  it("finds nothing with no code word", () => {
    expect(code("Your package 493021 is on its way")).toBeUndefined();
    expect(code("", "")).toBeUndefined();
  });

  it("matches a German compound and Turkish suffixed forms", () => {
    expect(code("Ihr Bestätigungscode", "Bestätigungscode: 493021")).toBe(
      "493021"
    );
    expect(code("Doğrulama kodunuz: 493021")).toBe("493021");
    expect(code("Giriş kodu 493021")).toBe("493021");
  });

  it("bounds a short word, so pin never fires inside shipping", () => {
    expect(code("Shipping update 493021")).toBeUndefined();
    expect(code("Your PIN is 4930")).toBe("4930");
  });

  it("is not opened by a code that is never pasted into a website", () => {
    expect(code("Your delivery code is 493021")).toBeUndefined();
    expect(code("Your pickup code is 493021")).toBeUndefined();
    expect(code("Ihr Abholcode lautet 493021")).toBeUndefined();
    expect(code("Your discount code 493021")).toBeUndefined();
  });
});

describe("the vetoes", () => {
  it("rejects a year, and only one in 2000 to 2099", () => {
    expect(code("Your code expires in 2026")).toBeUndefined();
    expect(code("Your code is 4930")).toBe("4930");
  });

  it("rejects money and percentages", () => {
    expect(code("Your code unlocks $4930 of credit")).toBeUndefined();
    expect(code("Your code unlocks 4930 EUR of credit")).toBeUndefined();
    expect(code("Your code gives 4930% back")).toBeUndefined();
  });

  it("rejects a number behind an order, invoice or tracking term", () => {
    expect(code("Your code, order 493021, is ready")).toBeUndefined();
    expect(code("Your code, invoice #493021, is ready")).toBeUndefined();
    expect(code("Your tracking code 493021 is ready")).toBeUndefined();
  });

  it("rejects a phone number", () => {
    expect(code("Your code was sent to +1234567")).toBeUndefined();
    expect(code("For your code call (030) 493021")).toBeUndefined();
  });
});

describe(extractVerificationCode, () => {
  it("prefers the code to an order number in the same sentence", () => {
    expect(code("Your code for order 12345678 is 4930")).toBe("4930");
  });

  it("finds a sign-in code in mail that also mentions a shipment", () => {
    expect(code("Order 987654 shipped. Your security code is 4930")).toBe(
      "4930"
    );
  });

  it("reads full-width and Arabic-Indic digits", () => {
    expect(code("認証コード: ４９３０２１")).toBe("493021");
    expect(code("رمز التحقق الخاص بك هو ٤٩٣٠٢١")).toBe("493021");
  });

  it("takes a code the subject announces and the summary carries", () => {
    expect(
      code("Your verification code", "Use 493021 to finish signing in")
    ).toBe("493021");
  });

  it("gives a tie to the subject", () => {
    expect(code("Your code is 4930", "Your code is 5678")).toBe("4930");
  });

  it("finds nothing when the summary is cut before the code", () => {
    expect(
      code("Your verification code", "Hi Tim, here is the code you")
    ).toBeUndefined();
  });

  it("looks no further than its cap into each text", () => {
    const filler = "x ".repeat(MOST_READ / 2);

    expect(code("Your code", `${filler}493021`)).toBeUndefined();
    expect(code("Your code", `${filler.slice(10)}493021`)).toBe("493021");
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
        extractVerificationCode([subject, summary]);
      }
    }

    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("the corpus", () => {
  it.each(
    corpus.map((entry) => ({
      ...entry,
      label: entry.note ? `${entry.subject} (${entry.note})` : entry.subject,
    }))
  )("$language: $label", ({ subject, summary, expected }) => {
    expect(extractVerificationCode([subject, summary])).toBe(
      expected ?? undefined
    );
  });

  it("holds every entry v3 does: 71 codes and 44 messages with none", () => {
    expect(corpus.filter((entry) => entry.expected !== null)).toHaveLength(71);
    expect(corpus.filter((entry) => entry.expected === null)).toHaveLength(44);
  });
});
