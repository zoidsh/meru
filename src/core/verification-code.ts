/**
 * The one-time code a new message carries, read from what Gmail's feed gives:
 * its subject and the summary, a snippet that is often cut mid-sentence. Moving
 * mail to Trash can follow a copy, so this is built for precision: a missed
 * code costs one manual copy, a wrong one can cost the mail.
 */

interface Range {
  start: number;
  end: number;
}

interface Candidate extends Range {
  digits: string;
  groups: readonly string[];
}

/**
 * The most of each text looked at. The feed caps neither, and a summary is
 * about 180 characters, so a code past this is past what Gmail would show.
 */
export const MOST_READ = 1000;

// `\b` knows only ASCII word characters and cannot bound a word such as "mã",
// so every anchor is a Unicode-property lookaround.
const LETTER_OR_DIGIT = String.raw`[\p{L}\p{N}]`;

// Han, kana and hangul are written without spaces, so one touching a digit run
// or a keyword is prose, not a glued identifier.
const NON_CJK_LETTER = String.raw`(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])\p{L}`;

const bounded = (source: string) =>
  new RegExp(
    `(?<!${LETTER_OR_DIGIT})(?:${source})(?!${LETTER_OR_DIGIT})`,
    "giu"
  );

/** Bounded before only, so a suffix such as Turkish "kodunuz" still matches. */
const prefix = (source: string) =>
  new RegExp(`(?<!${LETTER_OR_DIGIT})(?:${source})`, "giu");

/** Bounded after only, so a German compound such as "Bestätigungscode" matches. */
const suffix = (source: string) =>
  new RegExp(`(?:${source})(?!${LETTER_OR_DIGIT})`, "giu");

/** For scripts with no word boundaries; still case-folded, for "Код". */
const anywhere = (source: string) => new RegExp(source, "giu");

/** One of these somewhere in the message is the only hard gate. */
const CODE_WORDS = [
  suffix("code"),
  prefix("kod"),
  bounded("c[oó]digo"),
  bounded("codice"),
  bounded("koodi"),
  bounded("mã"),
  bounded("otp"),
  bounded(String.raw`one[-\s]?time\s?password`),
  bounded("passcode"),
  bounded("pin"),
  bounded("2fa"),
  anywhere("код"),
  anywhere("कोड"),
  anywhere("コード"),
  anywhere("验证码"),
  anywhere("驗證碼"),
  anywhere(String.raw`인증번호|인증\s?코드|코드`),
  anywhere("رمز"),
  anywhere("קוד"),
];

/** Raise every candidate's score. */
const CONTEXT_WORDS = [
  prefix("v[eé]rif"),
  prefix("confirm"),
  prefix("best[äa]tigung"),
  prefix("weryfikacj"),
  prefix("do[ğg]rulama"),
  bounded(String.raw`one[-\s]?time`),
  bounded(String.raw`single[-\s]?use`),
  bounded(String.raw`sign[-\s]?(?:in|up)`),
  bounded(String.raw`log[-\s]?in`),
  bounded("security"),
  prefix("authentic"),
  bounded(String.raw`two[-\s]?factor`),
  prefix("x[áa]c minh"),
  anywhere("подтвержд"),
  anywhere("認証"),
  anywhere("確認"),
  anywhere("验证|驗證"),
  anywhere("인증"),
  anywhere("تحقق"),
  anywhere("אימות"),
];

// A delivery code is read aloud at the door, so copying it is useless and
// hiding its mail does harm. Named ones are kept from the gate; the rest of
// the topic is a penalty, so a sign-in code in mail that mentions shipping can
// still win on proximity.
const DELIVERY_WORDS = [
  prefix("deliver"),
  bounded(String.raw`pick[-\s]?up`),
  prefix("collect"),
  prefix("ship"),
  prefix("track"),
  bounded("courier"),
  prefix("dispatch"),
  prefix("liefer"),
  prefix("zustell"),
  prefix("livrais"),
  prefix("entrega"),
  prefix("consegna"),
  prefix("dostaw"),
  prefix("teslim"),
  anywhere("доставк"),
  anywhere("配送|配達"),
  anywhere("快递|快遞"),
  anywhere("배송"),
];

// A numeric promo code beside the word "code" has a code's shape, so the
// topic pays instead.
const PROMO_WORDS = [
  anywhere(String.raw`\d\s?%\s?off|percent\s?off`),
  prefix("discount"),
  prefix("promo"),
  prefix("referral"),
  prefix("coupon"),
  prefix("voucher"),
  prefix("rabatt"),
  prefix("gutschein"),
  prefix("r[ée]duction"),
  prefix("descuento"),
  prefix("desconto"),
  prefix("sconto"),
  anywhere("скидк"),
  anywhere("折扣|优惠|優惠"),
  anywhere("割引|クーポン"),
  anywhere("할인|쿠폰"),
];

/**
 * A code word behind one of these names a code never pasted into a website:
 * discount, postal, QR, a pickup code read to a courier, and German compounds
 * such as "Rabattcode" and "Abholcode".
 */
const NOT_A_SIGN_IN_CODE = new RegExp(
  String.raw`(?:${[
    "discount",
    "promo(?:tional)?",
    "referral",
    "coupon",
    "voucher",
    "gift",
    "invite",
    "postal",
    "zip",
    "area",
    "dress",
    "qr",
    "error",
    "country",
    "bar",
    "tracking",
    "delivery",
    String.raw`pick[\s-]?up`,
    "collection",
    "abhol",
    "liefer",
    "rabatt",
    "gutschein",
    "werbe",
    "aktions",
    "empfehlungs",
    "geschenk",
  ].join("|")})[\s-]*$`,
  "iu"
);

/** How far behind a code word `NOT_A_SIGN_IN_CODE` looks. */
const QUALIFIER_REACH = 32;

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

const SEPARATOR = String.raw`[\s:#.-]{0,3}`;

const REFERENCE_BEFORE = new RegExp(
  `(?:#|(?<!${NON_CJK_LETTER})(?:${REFERENCE_WORDS.join("|")})${SEPARATOR}(?:(?:${REFERENCE_QUALIFIERS.join("|")})${SEPARATOR})?)$`,
  "iu"
);

const CURRENCY_SYMBOL = "[$€£¥₹₽₺₩¢₪﷼]";

const CURRENCY_CODE =
  "usd|eur|gbp|jpy|chf|cad|aud|inr|rub|brl|krw|cny|pln|sek|nok|dkk|czk|huf";

const CURRENCY_BEFORE = new RegExp(
  String.raw`(?:${CURRENCY_SYMBOL}|(?<!\p{L})(?:${CURRENCY_CODE}))\s?$`,
  "iu"
);

const MONEY_OR_PERCENT_AFTER = new RegExp(
  String.raw`^\s?(?:%|${CURRENCY_SYMBOL}|(?:${CURRENCY_CODE})(?!\p{L}))`,
  "iu"
);

const PHONE_BEFORE = /(?:\+[\d\s().-]{0,16}|\(\s?\d{1,5}\s?\)[\s-]{0,3})$/u;

/** How far around a candidate the vetoes look. */
const VETO_REACH = 40;

// Maximal, so a ten-digit phone number is one run too long to be a code
// rather than a source of shorter ones.
const DIGIT_RUN = /\d+(?:[ -]\d+)*/gu;

const GLUED_BEFORE = new RegExp(
  String.raw`(?:[\p{N}_-]|${NON_CJK_LETTER})$`,
  "u"
);

const GLUED_AFTER = new RegExp(
  String.raw`^(?:[\p{N}_-]|${NON_CJK_LETTER})`,
  "u"
);

const PART_OF_NUMBER_BEFORE = /\d[.,:/]$/u;

const PART_OF_NUMBER_AFTER = /^[.,:/]\d/u;

/** Group lengths a code is written in, besides one solid run. */
const GROUPINGS = new Set(["3,3", "4,4", "2,2,2", "2,2,2,2"]);

const SHORTEST = 4;

const LONGEST = 8;

// NFKC turns "493021，10分钟" into "493021,10分钟", which reads as one number,
// so a space goes after each of these marks, never a numeric separator, first.
const FULL_WIDTH_PUNCTUATION = /[，。、：；！？]/gu;

// NFKC folds full-width digits but leaves these decimal scripts alone.
const OTHER_DIGITS = /[٠-٩۰-۹०-९]/gu;

/** The zero of Arabic-Indic, Extended Arabic-Indic and Devanagari. */
const ZEROS = [0x06_60, 0x06_f0, 0x09_66];

// A fixed range rather than this year, so the result depends on its input alone.
const YEARS = { first: 2000, last: 2099 };

/** How close a code word must be to count as next to a candidate. */
const NEAR = 30;

const THRESHOLD = 30;

const WEIGHT = {
  codeWordNear: 60,
  codeWordInSameText: 25,
  codeWordInOtherText: 20,
  contextWord: 10,
  deliveryWord: -25,
  promoWord: -40,
  grouped: 16,
  /** By solid length. */
  length: { 4: 8, 5: 4, 6: 24, 7: 4, 8: 16 } as Record<number, number>,
};

/** Folds full-width and other decimal scripts' digits to ASCII. */
export const normalizeText = (text: string) =>
  text
    .replaceAll(FULL_WIDTH_PUNCTUATION, "$& ")
    .normalize("NFKC")
    .replaceAll(OTHER_DIGITS, (digit) => {
      const point = digit.codePointAt(0) ?? 0;
      const zero = ZEROS.find((start) => point >= start && point <= start + 9);

      return zero === undefined ? digit : String(point - zero);
    });

const isPlausibleGrouping = (groups: readonly string[]) =>
  groups.length === 1 ||
  GROUPINGS.has(groups.map((group) => group.length).join(","));

/** Each digit run shaped like a code, with its separators taken out. */
export const collectCandidates = (text: string): Candidate[] =>
  [...text.matchAll(DIGIT_RUN)].flatMap((match) => {
    const start = match.index;
    const end = start + match[0].length;
    const before = text.slice(Math.max(start - 2, 0), start);
    const after = text.slice(end, end + 2);
    const groups = match[0].split(/[ -]/u);
    const digits = groups.join("");

    const fits =
      !GLUED_BEFORE.test(before) &&
      !GLUED_AFTER.test(after) &&
      !PART_OF_NUMBER_BEFORE.test(before) &&
      !PART_OF_NUMBER_AFTER.test(after) &&
      digits.length >= SHORTEST &&
      digits.length <= LONGEST &&
      isPlausibleGrouping(groups);

    return fits ? [{ digits, groups, start, end }] : [];
  });

const isYear = ({ digits, groups }: Candidate) => {
  const year = Number(digits);

  return (
    groups.length === 1 &&
    digits.length === 4 &&
    year >= YEARS.first &&
    year <= YEARS.last
  );
};

const isVetoed = (candidate: Candidate, text: string) => {
  const before = text.slice(
    Math.max(candidate.start - VETO_REACH, 0),
    candidate.start
  );
  const after = text.slice(candidate.end, candidate.end + 6);

  return (
    isYear(candidate) ||
    CURRENCY_BEFORE.test(before) ||
    MONEY_OR_PERCENT_AFTER.test(after) ||
    REFERENCE_BEFORE.test(before) ||
    PHONE_BEFORE.test(before)
  );
};

const rangesOf = (text: string, words: readonly RegExp[]): Range[] =>
  words.flatMap((word) =>
    [...text.matchAll(word)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
  );

const mentions = (texts: readonly string[], words: readonly RegExp[]) =>
  texts.some((text) => words.some((word) => text.search(word) !== -1));

const codeWordsIn = (text: string) =>
  rangesOf(text, CODE_WORDS).filter(
    ({ start }) =>
      !NOT_A_SIGN_IN_CODE.test(
        text.slice(Math.max(start - QUALIFIER_REACH, 0), start)
      )
  );

const formatScore = ({ digits, groups }: Candidate) =>
  groups.length > 1 ? WEIGHT.grouped : (WEIGHT.length[digits.length] ?? 0);

const proximityScore = (candidate: Candidate, codeWords: readonly Range[]) => {
  const gaps = codeWords.map(({ start, end }) =>
    Math.max(
      start >= candidate.end ? start - candidate.end : candidate.start - end,
      0
    )
  );

  if (gaps.some((gap) => gap <= NEAR)) {
    return WEIGHT.codeWordNear;
  }

  return gaps.length > 0
    ? WEIGHT.codeWordInSameText
    : WEIGHT.codeWordInOtherText;
};

/**
 * The digits of the one-time code in `[subject, summary]`, separators taken
 * out, or `undefined` when nothing in them clears the bar.
 */
export const extractVerificationCode = (
  texts: readonly string[]
): string | undefined => {
  const normalized = texts.map((text) =>
    normalizeText(text.slice(0, MOST_READ)).slice(0, MOST_READ)
  );
  const codeWords = normalized.map(codeWordsIn);

  if (codeWords.every((ranges) => ranges.length === 0)) {
    return undefined;
  }

  const messageScore =
    (mentions(normalized, CONTEXT_WORDS) ? WEIGHT.contextWord : 0) +
    (mentions(normalized, DELIVERY_WORDS) ? WEIGHT.deliveryWord : 0) +
    (mentions(normalized, PROMO_WORDS) ? WEIGHT.promoWord : 0);

  let best: { digits: string; score: number } | undefined;

  for (const [index, text] of normalized.entries()) {
    for (const candidate of collectCandidates(text)) {
      if (isVetoed(candidate, text)) {
        continue;
      }

      const score =
        messageScore +
        formatScore(candidate) +
        proximityScore(candidate, codeWords[index] ?? []);

      // Strictly higher, so a tie goes to the earlier: the subject, then the start.
      if (score >= THRESHOLD && (!best || score > best.score)) {
        best = { digits: candidate.digits, score };
      }
    }
  }

  return best?.digits;
};
