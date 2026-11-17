/**
 * The one-time code a new message carries, read from what Gmail's feed gives:
 * its subject and summary, a snippet often cut mid-sentence. Trash can follow
 * a copy, so this leans to precision: a missed code costs one manual copy, a
 * wrong one can cost the mail.
 */

import { maxBy } from "es-toolkit";

/** The most of each text read, after normalising; the feed caps neither. */
export const MOST_READ = 1000;

/** A word is bounded by what is not a letter or a digit, in any script. */
const NOT_WORD_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const NOT_WORD_AFTER = String.raw`(?![\p{L}\p{N}])`;

/** A letter of a script written with spaces, which glues to a number it touches. */
const SPACED_LETTER = String.raw`(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])\p{L}`;

type Anchor = "word" | "start" | "end" | "none";

/**
 * A lexicon entry: the whole word, its start (so a suffix such as Turkish
 * "kodunuz" matches), its end (so a German compound such as
 * "Bestätigungscode" does), or anywhere, for scripts with no spaces.
 */
const word = (source: string, anchor: Anchor = "word") =>
  new RegExp(
    `${anchor === "word" || anchor === "start" ? NOT_WORD_BEFORE : ""}(?:${source})${anchor === "word" || anchor === "end" ? NOT_WORD_AFTER : ""}`,
    "giu"
  );

/** At least one of these is the only hard gate. */
const CODE_WORDS = [
  word("code", "end"),
  word("kod", "start"),
  word("c[oó]digo"),
  word("codice"),
  word("koodi"),
  word("mã"),
  word("otp"),
  word(String.raw`one[-\s]?time\s?password`),
  word("passcode"),
  word("pin"),
  word("2fa"),
  word("код", "none"),
  word("कोड", "none"),
  word("コード", "none"),
  word("验证码", "none"),
  word("驗證碼", "none"),
  word(String.raw`인증번호|인증\s?코드|코드`, "none"),
  word("رمز", "none"),
  word("קוד", "none"),
];

/**
 * What a code word right behind one of these names is never pasted into a
 * website: a discount, a postcode, an exit status, a locker or a pickup at
 * the door, an order. German compounds such as "Rabattcode" count too.
 */
const NOT_SIGN_IN_KINDS = [
  "discount",
  "promo(?:tional)?",
  "referral",
  "coupon",
  "voucher",
  "gift",
  "invite",
  "post(?:al)?",
  "zip",
  "area",
  "dress",
  "qr",
  "error",
  "exit",
  "status",
  "return",
  "response",
  "country",
  "bar",
  "tracking",
  "delivery",
  String.raw`pick[\s-]?up`,
  "collection",
  "locker",
  "parcel",
  "package",
  "order",
  "abhol",
  "liefer",
  "paket",
  "rabatt",
  "gutschein",
  "werbe",
  "aktions",
  "empfehlungs",
  "geschenk",
];

const NOT_SIGN_IN_BEFORE = new RegExp(
  String.raw`(?:${NOT_SIGN_IN_KINDS.join("|")})[\s-]*$`,
  "iu"
);

/**
 * The same, for languages that name the kind after the code word: Polish "kod
 * zamówienia", Spanish "código del pedido", French "code de commande".
 */
const NOT_SIGN_IN_AFTER =
  /^[\s-]*(?:(?:de|del|do|da|dell['’]|di)\s+)?(?:zam[oó]wieni\p{L}*|pedido|commande|ordine|encomenda|заказ\p{L}*|promo\p{L}*|rabat\p{L}*|descuento|r[ée]duction|postal)(?!\p{L})/iu;

/** How far around a code word its kind is looked for. */
const KIND_REACH = 32;

/** A meeting's dial-in PIN and passcode are typed into a phone or an app, not pasted. */
const MEETING_WORDS = [
  word(String.raw`dial[-\s]?in`),
  word(String.raw`join\s+by\s+phone`),
  word(String.raw`meeting\s+id`),
  word(String.raw`conference\s+id`),
];

/** Raise every candidate. */
const CONTEXT_WORDS = [
  word("v[eé]rif", "start"),
  word("confirm", "start"),
  word("best[äa]tigung", "start"),
  word("weryfikacj", "start"),
  word("do[ğg]rulama", "start"),
  word(String.raw`one[-\s]?time`),
  word(String.raw`single[-\s]?use`),
  word(String.raw`sign[-\s]?(?:in|up)`),
  word(String.raw`log[-\s]?in`),
  word("security"),
  word("authentic", "start"),
  word(String.raw`two[-\s]?factor`),
  word("x[áa]c minh", "start"),
  word("подтвержд", "none"),
  word("認証", "none"),
  word("確認", "none"),
  word("验证|驗證", "none"),
  word("인증", "none"),
  word("تحقق", "none"),
  word("אימות", "none"),
];

/**
 * A delivery code is read aloud at the door. Named ones close the gate; the
 * rest of the topic only lowers a candidate, so a sign-in code in mail that
 * mentions shipping still wins.
 */
const DELIVERY_WORDS = [
  word("deliver", "start"),
  word(String.raw`pick[-\s]?up`),
  word("collect", "start"),
  word("ship", "start"),
  word("track", "start"),
  word("courier"),
  word("dispatch", "start"),
  word("liefer", "start"),
  word("zustell", "start"),
  word("livrais", "start"),
  word("entrega", "start"),
  word("consegna", "start"),
  word("dostaw", "start"),
  word("teslim", "start"),
  word("доставк", "none"),
  word("配送|配達", "none"),
  word("快递|快遞", "none"),
  word("배송", "none"),
];

/** A promo code has a code's shape, so the topic pays for it. */
const PROMO_WORDS = [
  word(String.raw`\d\s?%\s?off|percent\s?off`, "none"),
  word("discount", "start"),
  word("promo", "start"),
  word("referral", "start"),
  word("coupon", "start"),
  word("voucher", "start"),
  word("checkout"),
  word("spend"),
  word("redeem", "start"),
  word("rabatt", "start"),
  word("gutschein", "start"),
  word("r[ée]duction", "start"),
  word("descuento", "start"),
  word("desconto", "start"),
  word("sconto", "start"),
  word("скидк", "none"),
  word("折扣|优惠|優惠", "none"),
  word("割引|クーポン", "none"),
  word("할인|쿠폰", "none"),
];

/** Words whose number follows them, which is never a code. */
const REFERENCE_WORDS = [
  "order",
  "invoice",
  "receipt",
  "tracking",
  "shipment",
  "ticket",
  "reference",
  String.raw`ref\.?`,
  "transaction",
  "flight",
  String.raw`confirmation\s+number`,
  String.raw`bestell\p{L}*`,
  String.raw`auftrag\p{L}*`,
  String.raw`rechnung\p{L}*`,
  String.raw`sendungs\p{L}*`,
  "commande",
  "facture",
  "pedido",
  "encomenda",
  "factura",
  "fatura",
  "ordine",
  "fattura",
  String.raw`zam[oó]wieni\p{L}*`,
  String.raw`sipari[şs]\p{L}*`,
  String.raw`заказ\p{L}*`,
  "注文",
  "订单",
  "訂單",
  "주문",
  "الطلب",
  "הזמנה",
];

const REFERENCE_QUALIFIERS = [
  "number",
  String.raw`no\.?`,
  String.raw`nr\.?`,
  "num",
  "id",
  "code",
  "#",
  "番号",
  "号",
  "번호",
];

/** Words that name an identifier only with a number word after them. */
const IDENTIFIER_WORDS = [
  "account",
  "acct",
  "customer",
  "client",
  String.raw`member(?:ship)?`,
  "policy",
  "vat",
  "tax",
  "card",
];

/** What a quantity counts, so the number before it is an amount. */
const UNITS = [
  "points?",
  "lines?",
  "users?",
  "people",
  "developers?",
  "customers?",
  "members?",
  "followers?",
  "words?",
  "steps?",
  "items?",
  "files?",
  "seconds?",
  "minutes?",
  "hours?",
  "days?",
  "weeks?",
  "months?",
  "years?",
  "miles?",
  "km",
  "kg",
  "times",
  "stars?",
  "views?",
  "downloads?",
  "credits?",
  "coins?",
  "punkte",
  "puntos",
];

const SEPARATOR = String.raw`[\s:#.-]{0,3}`;

const CURRENCY_SYMBOL = "[$€£¥₹₽₺₩¢₪﷼]";

const CURRENCY_CODE =
  "usd|eur|gbp|jpy|chf|cad|aud|inr|rub|brl|krw|cny|pln|sek|nok|dkk|czk|huf";

/** How far around a candidate a veto looks. */
const VETO_REACH = 40;

/** A rule that rules a candidate out, whatever it scores. */
interface Veto {
  /** Looks at the text before the candidate, up to `VETO_REACH`. */
  before?: RegExp;
  /** Looks at the text after it, as far. */
  after?: RegExp;
  /** Looks at the candidate itself. */
  digits?: (candidate: Candidate) => boolean;
}

const VETOES: Record<string, Veto> = {
  /** A year, read as a fixed range, so the answer never depends on the clock. */
  year: {
    digits: ({ digits, grouped }) => !grouped && /^20\d\d$/u.test(digits),
  },
  money: {
    before: new RegExp(
      String.raw`(?:${CURRENCY_SYMBOL}|(?<!\p{L})(?:${CURRENCY_CODE}))\s?$`,
      "iu"
    ),
    after: new RegExp(
      String.raw`^\s?(?:%|${CURRENCY_SYMBOL}|(?:${CURRENCY_CODE})(?!\p{L}))`,
      "iu"
    ),
  },
  reference: {
    before: new RegExp(
      String.raw`(?:#|(?<!${SPACED_LETTER})(?:${REFERENCE_WORDS.join("|")})${SEPARATOR}(?:(?:${REFERENCE_QUALIFIERS.join("|")})${SEPARATOR})?)$`,
      "iu"
    ),
  },
  identifier: {
    before: new RegExp(
      String.raw`(?<!\p{L})(?:${IDENTIFIER_WORDS.join("|")})\s?(?:number|no\.?|nr\.?|num|#|id)${SEPARATOR}$`,
      "iu"
    ),
  },
  cardEnding: {
    before:
      /(?:ending(?:\s+in)?|ends\s+(?:in|with)|last\s+(?:4|four)(?:\s+digits)?)[\s:]*$/iu,
  },
  /** Phone punctuation, or a word that calls, earlier in the same clause. */
  phone: {
    before:
      /(?:\+[\d\s().-]{0,16}|\(\s?\d{1,5}\s?\)[\s-]{0,3}|(?<!\p{L})(?:call|phone|tel|telephone|helpline|hotline|fax|whatsapp|dial)(?!\p{L})[^.!?\n]{0,24})$/iu,
  },
  quantity: {
    after: new RegExp(String.raw`^\s(?:${UNITS.join("|")})(?!\p{L})`, "iu"),
  },
};

const isVetoed = (candidate: Candidate, text: string) => {
  const before = text.slice(
    Math.max(candidate.start - VETO_REACH, 0),
    candidate.start
  );
  const after = text.slice(candidate.end, candidate.end + VETO_REACH);

  return Object.values(VETOES).some(
    (veto) =>
      veto.before?.test(before) === true ||
      veto.after?.test(after) === true ||
      veto.digits?.(candidate) === true
  );
};

interface Range {
  start: number;
  end: number;
}

export interface Candidate extends Range {
  digits: string;
  /** Written in groups, such as `493 021`. */
  grouped: boolean;
}

/** Group lengths a code is written in, besides a solid run of 4 to 8. */
const GROUPINGS = new Set(["3 3", "4 4", "2 2 2", "2 2 2 2"]);

/** A maximal run, so a ten-digit phone number is too long rather than two codes. */
const DIGIT_RUN = /\d+(?:[ -]\d+)*/gu;

/** A letter or digit touching a run glues it into a longer token. */
const GLUED_BEFORE = new RegExp(
  String.raw`(?:[\p{N}_-]|${SPACED_LETTER})$`,
  "u"
);
const GLUED_AFTER = new RegExp(
  String.raw`^(?:[\p{N}_-]|${SPACED_LETTER})`,
  "u"
);

/** A short capital prefix, as Google's `G-482910`, is part of how the code is written. */
const CODE_PREFIX = /(?:^|[^\p{L}\p{N}])\p{Lu}{1,2}-$/u;

const IN_LARGER_NUMBER_BEFORE = /\d[.,:/]$/u;
const IN_LARGER_NUMBER_AFTER = /^[.,:/]\d/u;

const shapeOf = (run: string) => {
  const groups = run.split(/[ -]/u);
  const digits = groups.join("");
  const lengths = groups.map((group) => group.length).join(" ");
  const fits =
    groups.length === 1
      ? digits.length >= 4 && digits.length <= 8
      : GROUPINGS.has(lengths);

  return fits ? { digits, grouped: groups.length > 1 } : undefined;
};

/** Each run of digits shaped like a code and standing on its own. */
export const candidatesIn = (text: string): Candidate[] =>
  [...text.matchAll(DIGIT_RUN)].flatMap((match) => {
    const start = match.index;
    const end = start + match[0].length;
    const before = text.slice(Math.max(start - 4, 0), start);
    const after = text.slice(end, end + 2);
    const shape = shapeOf(match[0]);
    const glued =
      (GLUED_BEFORE.test(before) && !CODE_PREFIX.test(before)) ||
      GLUED_AFTER.test(after) ||
      IN_LARGER_NUMBER_BEFORE.test(before) ||
      IN_LARGER_NUMBER_AFTER.test(after);

    return shape && !glued ? [{ ...shape, start, end }] : [];
  });

/** Sentence marks of full-width text, which NFKC would turn into separators. */
const FULL_WIDTH_MARKS = /[，。、：；！？]/gu;

/** The zero of each decimal script NFKC leaves alone. */
const ZEROS = [0x06_60, 0x06_f0, 0x09_66];

const OTHER_DIGIT = /[٠-٩۰-۹०-९]/gu;

const toAsciiDigit = (digit: string) => {
  const point = digit.codePointAt(0) ?? 0;
  const zero = ZEROS.find((start) => point >= start && point <= start + 9);

  return zero === undefined ? digit : String(point - zero);
};

/**
 * Every digit as ASCII: NFKC folds full-width ones, a table the Arabic-Indic
 * and Devanagari ones. A full-width sentence mark becomes a line break,
 * which no run of digits crosses, so "493021，10分钟" stays two numbers where
 * NFKC's comma or a space would join them.
 */
export const normalize = (text: string) =>
  text
    .replaceAll(FULL_WIDTH_MARKS, "\n")
    .normalize("NFKC")
    .replaceAll(OTHER_DIGIT, toAsciiDigit);

/** The run of digits the text ends in, with a separator it may end on. */
const TRAILING_RUN = /\d+(?:[ -]\d+)*[ -]?$/u;

/**
 * The first `MOST_READ` characters, less a run of digits the cut goes
 * through, which would otherwise read as a shorter number that is not there.
 */
export const cut = (text: string) => {
  if (text.length <= MOST_READ) {
    return text;
  }

  const kept = text.slice(0, MOST_READ);
  const tail = TRAILING_RUN.exec(kept)?.[0] ?? "";
  const whole =
    /^\d+(?:[ -]\d+)*/u.exec(text.slice(MOST_READ - tail.length))?.[0] ?? "";

  return whole.length > tail.trimEnd().length
    ? kept.slice(0, MOST_READ - tail.length)
    : kept;
};

const rangesOf = (text: string, words: readonly RegExp[]): Range[] =>
  words.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
  );

const mentions = (texts: readonly string[], words: readonly RegExp[]) =>
  texts.some((text) => words.some((pattern) => text.search(pattern) !== -1));

/** Whether the code word at `range` names a code never pasted into a website. */
const namesOtherKind = (text: string, { start, end }: Range) =>
  NOT_SIGN_IN_BEFORE.test(text.slice(Math.max(start - KIND_REACH, 0), start)) ||
  NOT_SIGN_IN_AFTER.test(text.slice(end, end + KIND_REACH));

/** How close a code word is to count as next to a candidate. */
const NEAR = 30;

const THRESHOLD = 3;

const POINTS = {
  /** A code word in the same text within `NEAR`. */
  near: 6,
  /** A code word anywhere else in the message. */
  far: 2,
  context: 1,
  delivery: -2,
  promo: -5,
};

/** Six digits is the common shape; eight and grouped next; four last of the rest. */
const shapePoints = ({ digits, grouped }: Candidate) => {
  if (grouped || digits.length === 8) {
    return 2;
  }

  return { 4: 1, 6: 3 }[digits.length] ?? 0;
};

const isNear = (candidate: Candidate, codeWords: readonly Range[]) =>
  codeWords.some(
    ({ start, end }) =>
      Math.max(start - candidate.end, candidate.start - end, 0) <= NEAR
  );

/**
 * The digits of the one-time code in `[subject, summary]`, separators taken
 * out, or `undefined` when nothing in them clears the bar. A tie goes to the
 * earlier: the subject, then the start.
 */
export const extractVerificationCode = (
  texts: readonly string[]
): string | undefined => {
  const read = texts.map((text) => cut(normalize(text)));
  const codeWords = read.map((text) => rangesOf(text, CODE_WORDS));

  // A message that names a discount, a locker or an order code anywhere is
  // about that code, whatever other code words it has, as is a meeting's.
  if (
    codeWords.every((ranges) => ranges.length === 0) ||
    read.some((text, index) =>
      codeWords[index]?.some((range) => namesOtherKind(text, range))
    ) ||
    mentions(read, MEETING_WORDS)
  ) {
    return undefined;
  }

  const topic =
    (mentions(read, CONTEXT_WORDS) ? POINTS.context : 0) +
    (mentions(read, DELIVERY_WORDS) ? POINTS.delivery : 0) +
    (mentions(read, PROMO_WORDS) ? POINTS.promo : 0);

  const scored = read.flatMap((text, index) =>
    candidatesIn(text)
      .filter((candidate) => !isVetoed(candidate, text))
      .map((candidate) => ({
        digits: candidate.digits,
        score:
          topic +
          shapePoints(candidate) +
          (isNear(candidate, codeWords[index] ?? [])
            ? POINTS.near
            : POINTS.far),
      }))
  );

  // The first of the highest, so a tie goes to the subject, then the start.
  return maxBy(
    scored.filter(({ score }) => score >= THRESHOLD),
    ({ score }) => score
  )?.digits;
};
