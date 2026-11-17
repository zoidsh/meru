import { describe, expect, it } from "vitest";

import { corpusV4 } from "./verification-code.corpus-v4.ts";
import { corpus } from "./verification-code.corpus.ts";
import {
  MOST_READ,
  candidatesIn,
  cut,
  extractVerificationCode,
  normalize,
} from "./verification-code.ts";

const digitsOf = (text: string) =>
  candidatesIn(text).map((candidate) => candidate.digits);

const code = (subject: string, summary = "") =>
  extractVerificationCode([subject, summary]);

describe(normalize, () => {
  it.each([
    ["full-width", "４９３０２１"],
    ["Arabic-Indic", "٤٩٣٠٢١"],
    ["Extended Arabic-Indic", "۴۹۳۰۲۱"],
    ["Devanagari", "४९३०२१"],
  ])("folds %s digits to ASCII", (_script, digits) => {
    expect(normalize(digits)).toBe("493021");
  });

  it("leaves ASCII text as it is", () => {
    expect(normalize("Your code is 493021")).toBe("Your code is 493021");
  });

  it("keeps a full-width comma from joining a code to the number after it", () => {
    expect(digitsOf(normalize("验证码493021，10分钟内有效"))).toStrictEqual([
      "493021",
    ]);
  });
});

/** Filler that brings `kept` to the cap's end. */
const room = (kept: string) => "x".repeat(MOST_READ - kept.length);

describe(cut, () => {
  it("keeps a text within the cap as it is", () => {
    expect(cut("Your code is 493021")).toBe("Your code is 493021");
  });

  it("drops a run of digits the cut goes through, grouped or not", () => {
    for (const [kept, rest] of [
      ["call 555123", "4567"],
      ["code 482", " 910"],
      ["code 482 ", "910"],
      ["code 482 9", "10"],
    ] as const) {
      expect(cut(`${room(kept)}${kept}${rest}`)).toBe(
        `${room(kept)}${kept.replace(/\d[\d ]*$/u, "")}`
      );
    }
  });

  it("keeps a run that ends at the cut", () => {
    const kept = "code 482910";

    expect(cut(`${room(kept)}${kept} is yours`)).toBe(`${room(kept)}${kept}`);
  });
});

describe("the cap", () => {
  it("never reads a shorter code into a run the cut goes through", () => {
    const before = "Your code is ready: ";
    const filler = "x".repeat(MOST_READ - before.length - 6);

    expect(
      code("Your access code", `${filler}${before}5551234567`)
    ).toBeUndefined();
  });

  it("cuts after normalising, which can lengthen a text", () => {
    expect(code(`${"ﬀ".repeat(495)} code 4930217`)).toBeUndefined();
  });

  it("reads a code within the cap and nothing past it", () => {
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
      `call${"x".repeat(10_000)}`,
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

describe(candidatesIn, () => {
  it("takes a solid run of four to eight digits", () => {
    for (const digits of ["4930", "49302", "493021", "4930217", "49302176"]) {
      expect(digitsOf(`code ${digits}`)).toStrictEqual([digits]);
    }
  });

  it("takes the groupings a code is written in, without separators", () => {
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
      expect(candidatesIn(text)).toStrictEqual([]);
    }
  });

  it("rejects a run glued to letters or inside a larger number", () => {
    for (const text of [
      "code AB493021",
      "code 493021px",
      "code 12.493021",
      "code 493021.75",
      "code INV-493021",
    ]) {
      expect(candidatesIn(text)).toStrictEqual([]);
    }
  });

  it("takes a code behind a short capital prefix, as Google writes it", () => {
    expect(digitsOf("G-482910 is your code")).toStrictEqual(["482910"]);
  });

  it("tells where each is", () => {
    expect(candidatesIn("Your code is 493021")).toStrictEqual([
      { digits: "493021", grouped: false, start: 13, end: 19 },
    ]);
  });
});

describe("the gate", () => {
  it("opens only on a code word", () => {
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

  it.each([
    ["a delivery code", "Your delivery code is 493021"],
    ["a German pickup code", "Ihr Abholcode lautet 493021"],
    ["a discount code", "Your discount code 493021"],
    ["an exit status", "Process completed with exit code 493021"],
    ["a postcode", "Your postcode is 493021"],
    ["a locker PIN", "Your locker PIN is 493021"],
    ["an order code", "Your order code is 493021"],
    ["an order code named after the word", "Kod zamówienia 493021"],
  ])("stays shut on %s, and so for the whole message", (_kind, text) => {
    expect(code(text)).toBeUndefined();
    expect(code(text, "Your sign-in code is 582013")).toBeUndefined();
  });

  it("stays shut on a meeting's dial-in", () => {
    expect(code("Weekly sync", "Join by phone, PIN 482910")).toBeUndefined();
    expect(
      code("Invite", "Meeting ID 8123 4567, passcode 482910")
    ).toBeUndefined();
  });
});

describe("the vetoes", () => {
  it.each([
    ["a year", "Your code expires in 2026"],
    ["money before", "Your code unlocks $4930 of credit"],
    ["money after", "Your code unlocks 4930 EUR of credit"],
    ["a percentage", "Your code gives 4930% back"],
    ["an order number", "Your code, order 493021, is ready"],
    ["an invoice number", "Your code, invoice #493021, is ready"],
    ["a flight number", "Your code: flight 4930 is boarding"],
    ["an account number", "Your code: account number 49302176"],
    ["a VAT number", "Your code: VAT no. 49302176"],
    ["a card ending", "Your code for the card ending in 4930"],
    ["phone punctuation", "Your code was sent to +1234567"],
    ["a phone area code", "For your code call (030) 493021"],
    ["a word that calls", "Your code? Phone us on 0345 6789"],
    ["a quantity", "Your code has 4930 points"],
  ])("rules out %s", (_kind, text) => {
    expect(code(text)).toBeUndefined();
  });

  it("keeps a four-digit run outside the years", () => {
    expect(code("Your code is 4930")).toBe("4930");
  });

  it("lets a call earlier in the message, a sentence before, stand", () => {
    expect(code("Didn't ask? Call us.", "Your code is 482910")).toBe("482910");
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

  it("lets promo wording outweigh a short code but not a six-digit one", () => {
    expect(code("Your code is 4930", "Spend more at checkout")).toBeUndefined();
    expect(code("Your code is 493021", "Spend more at checkout")).toBe(
      "493021"
    );
  });

  it("finds nothing when the summary is cut before the code", () => {
    expect(
      code("Your verification code", "Hi Tim, here is the code you")
    ).toBeUndefined();
  });
});

describe("v3's corpus", () => {
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

  it("holds 71 codes and 44 messages with none", () => {
    expect(corpus.filter((entry) => entry.expected !== null)).toHaveLength(71);
    expect(corpus.filter((entry) => entry.expected === null)).toHaveLength(44);
  });
});

describe("v4's corpus", () => {
  it.each(
    corpusV4.map((entry) => ({
      ...entry,
      label: entry.knownMiss
        ? `${entry.subject} (known miss: ${entry.knownMiss.why})`
        : entry.subject,
      answer: entry.knownMiss ? entry.knownMiss.answer : entry.expected,
    }))
  )("$language: $label", ({ subject, summary, answer }) => {
    expect(extractVerificationCode([subject, summary])).toBe(
      answer ?? undefined
    );
  });
});
