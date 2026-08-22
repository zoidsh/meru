import { describe, expect, test } from "bun:test";
import { corpus } from "./corpus.fixtures";
import { collectCandidates, extractVerificationCode, normalizeText } from "./index";

describe("normalizeText", () => {
  test("folds full-width digits to ASCII", () => {
    expect(normalizeText("４９３０２１")).toBe("493021");
  });

  test("maps Arabic-Indic digits to ASCII", () => {
    expect(normalizeText("٤٩٣٠٢١")).toBe("493021");
  });

  test("maps Extended Arabic-Indic digits to ASCII", () => {
    expect(normalizeText("۴۹۳۰۲۱")).toBe("493021");
  });

  test("maps Devanagari digits to ASCII", () => {
    expect(normalizeText("४९३०२१")).toBe("493021");
  });

  test("leaves ASCII text untouched", () => {
    expect(normalizeText("Your code is 493021")).toBe("Your code is 493021");
  });
});

describe("collectCandidates", () => {
  test("collects a solid run of four to eight digits", () => {
    expect(collectCandidates("code 4930").map((candidate) => candidate.digits)).toEqual(["4930"]);
    expect(collectCandidates("code 49302").map((candidate) => candidate.digits)).toEqual(["49302"]);
    expect(collectCandidates("code 493021").map((candidate) => candidate.digits)).toEqual([
      "493021",
    ]);
    expect(collectCandidates("code 4930217").map((candidate) => candidate.digits)).toEqual([
      "4930217",
    ]);
    expect(collectCandidates("code 49302176").map((candidate) => candidate.digits)).toEqual([
      "49302176",
    ]);
  });

  test("collects plausible groupings and strips their separators", () => {
    expect(collectCandidates("code 493 021").map((candidate) => candidate.digits)).toEqual([
      "493021",
    ]);
    expect(collectCandidates("code 4930-2176").map((candidate) => candidate.digits)).toEqual([
      "49302176",
    ]);
    expect(collectCandidates("code 49 30 21").map((candidate) => candidate.digits)).toEqual([
      "493021",
    ]);
    expect(collectCandidates("code 49-30-21-76").map((candidate) => candidate.digits)).toEqual([
      "49302176",
    ]);
  });

  test("rejects implausible groupings", () => {
    expect(collectCandidates("code 493 0217")).toEqual([]);
    expect(collectCandidates("code 4 93021")).toEqual([]);
  });

  test("rejects runs shorter than four digits", () => {
    expect(collectCandidates("code 493")).toEqual([]);
    expect(collectCandidates("code 49 30")).toEqual([]);
  });

  test("yields nothing for an over-long run", () => {
    expect(collectCandidates("call 5551234567 now")).toEqual([]);
    expect(collectCandidates("tracking 1234 5678 9012")).toEqual([]);
    expect(collectCandidates("tracking 123456789012")).toEqual([]);
  });

  test("rejects a run glued to letters", () => {
    expect(collectCandidates("code AB493021")).toEqual([]);
    expect(collectCandidates("code 493021px")).toEqual([]);
  });

  test("rejects a run that is part of a larger number", () => {
    expect(collectCandidates("code 12.493021")).toEqual([]);
    expect(collectCandidates("code 493021.75")).toEqual([]);
  });

  test("reports the position of every candidate", () => {
    const [candidate] = collectCandidates("Your code is 493021");

    expect(candidate?.start).toBe(13);
    expect(candidate?.end).toBe(19);
  });
});

describe("extractVerificationCode gate", () => {
  test("returns null when no code word appears", () => {
    expect(extractVerificationCode(["Your package 493021 is on its way", ""])).toBeNull();
  });

  test("matches a German compound", () => {
    expect(extractVerificationCode(["Ihr Bestätigungscode", "Bestätigungscode: 493021"])).toBe(
      "493021",
    );
  });

  test("matches Turkish suffixed forms", () => {
    expect(extractVerificationCode(["Doğrulama kodunuz: 493021", ""])).toBe("493021");
    expect(extractVerificationCode(["Giriş kodu 493021", ""])).toBe("493021");
  });

  test("does not read a code word inside a longer word", () => {
    expect(extractVerificationCode(["Shipping update 493021", ""])).toBeNull();
  });

  test("matches a bounded pin", () => {
    expect(extractVerificationCode(["Your PIN is 4930", ""])).toBe("4930");
  });
});

describe("extractVerificationCode vetoes", () => {
  test("rejects a plausible year", () => {
    expect(extractVerificationCode(["Your code expires in 2026", ""])).toBeNull();
  });

  test("accepts a four-digit run outside the year range", () => {
    expect(extractVerificationCode(["Your code is 4930", ""])).toBe("4930");
  });

  test("rejects an amount of money", () => {
    expect(extractVerificationCode(["Your code unlocks $4930 of credit", ""])).toBeNull();
    expect(extractVerificationCode(["Your code unlocks 4930 EUR of credit", ""])).toBeNull();
  });

  test("rejects a percentage", () => {
    expect(extractVerificationCode(["Your code gives 4930% back", ""])).toBeNull();
  });

  test("rejects a number behind an order term", () => {
    expect(extractVerificationCode(["Your code, order 493021, is ready", ""])).toBeNull();
    expect(extractVerificationCode(["Your code, invoice #493021, is ready", ""])).toBeNull();
    expect(extractVerificationCode(["Your tracking code 493021 is ready", ""])).toBeNull();
  });

  test("rejects a phone number", () => {
    expect(extractVerificationCode(["Your code was sent to +1234567", ""])).toBeNull();
    expect(extractVerificationCode(["For your code call (030) 493021", ""])).toBeNull();
  });
});

describe("extractVerificationCode", () => {
  test("prefers the code over the order number in the same sentence", () => {
    expect(extractVerificationCode(["Your code for order 12345678 is 4930", ""])).toBe("4930");
  });

  test("extracts a code from a message that also reports a shipment", () => {
    expect(extractVerificationCode(["Order 987654 shipped. Your security code is 4930", ""])).toBe(
      "4930",
    );
  });

  test("extracts a full-width code", () => {
    expect(extractVerificationCode(["認証コード: ４９３０２１", ""])).toBe("493021");
  });

  test("extracts an Arabic-Indic code", () => {
    expect(extractVerificationCode(["رمز التحقق الخاص بك هو ٤٩٣٠٢١", ""])).toBe("493021");
  });

  test("extracts a code the subject announces and the snippet carries", () => {
    expect(
      extractVerificationCode(["Your verification code", "Use 493021 to finish signing in"]),
    ).toBe("493021");
  });

  test("extracts a grouped code with its separators stripped", () => {
    expect(extractVerificationCode(["Your verification code is 493-021", ""])).toBe("493021");
  });

  test("extracts a delivery one-time code despite the delivery penalty", () => {
    expect(extractVerificationCode(["Your delivery code is 493021", ""])).toBe("493021");
  });

  test("breaks a tie between equal scores in favor of the subject", () => {
    expect(extractVerificationCode(["Your code is 4930", "Your code is 5678"])).toBe("4930");
  });

  test("returns null for an order confirmation", () => {
    expect(
      extractVerificationCode([
        "Your order has shipped",
        "Order 12345678 is on its way and arrives on 24 August 2026",
      ]),
    ).toBeNull();
  });

  test("returns null when the snippet truncates before the code", () => {
    expect(
      extractVerificationCode(["Your verification code", "Hi Tim, here is the code you"]),
    ).toBeNull();
  });

  test("returns null for empty input", () => {
    expect(extractVerificationCode(["", ""])).toBeNull();
  });
});

describe("corpus", () => {
  for (const entry of corpus) {
    const label = entry.note
      ? `${entry.language}: ${entry.subject} (${entry.note})`
      : `${entry.language}: ${entry.subject}`;

    test(label, () => {
      expect(extractVerificationCode([entry.subject, entry.summary])).toBe(entry.expected);
    });
  }
});
