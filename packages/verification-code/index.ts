type LexiconEntry = {
  name: string;
  pattern: RegExp;
};

type TextRange = {
  start: number;
  end: number;
};

export type CodeCandidate = {
  digits: string;
  groups: string[];
  start: number;
  end: number;
};

// `\b` only knows ASCII word characters, so it cannot bound a word that ends in a
// letter outside that set — `/\bmã\b/` never matches "mã xác minh". Every anchor
// below is built from Unicode-property lookarounds instead.
const letterOrDigit = "[\\p{L}\\p{N}]";

// CJK scripts write without spaces, so an ideograph, kana, or hangul syllable
// touching a digit run or a keyword is normal prose, not a glued identifier.
const nonCjkLetter =
  "(?![\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}])\\p{L}";

function wordBounded(source: string): RegExp {
  return new RegExp(`(?<!${letterOrDigit})(?:${source})(?!${letterOrDigit})`, "giu");
}

function prefixAnchored(source: string): RegExp {
  return new RegExp(`(?<!${letterOrDigit})(?:${source})`, "giu");
}

function suffixAnchored(source: string): RegExp {
  return new RegExp(`(?:${source})(?!${letterOrDigit})`, "giu");
}

// Case-insensitive despite targeting mostly caseless scripts: Cyrillic entries
// still need to match capitalized forms like "Код".
function unanchored(source: string): RegExp {
  return new RegExp(source, "giu");
}

// One code word anywhere in the inputs is the only hard text gate.
const codeWords: LexiconEntry[] = [
  { name: "code (en, de compounds, fr, nl, da)", pattern: suffixAnchored("code") },
  { name: "kod (tr suffixed, pl, sv, no, id)", pattern: prefixAnchored("kod") },
  { name: "codigo (es, pt)", pattern: wordBounded("c[oó]digo") },
  { name: "codice (it)", pattern: wordBounded("codice") },
  { name: "koodi (fi)", pattern: wordBounded("koodi") },
  { name: "ma (vi)", pattern: wordBounded("mã") },
  { name: "otp (en)", pattern: wordBounded("otp") },
  { name: "one-time password (en)", pattern: wordBounded("one[-\\s]?time\\s?password") },
  { name: "passcode (en)", pattern: wordBounded("passcode") },
  { name: "pin (en, de, fr)", pattern: wordBounded("pin") },
  { name: "two-factor (en)", pattern: wordBounded("2fa") },
  { name: "kod (ru, uk, bg)", pattern: unanchored("код") },
  { name: "kod (hi)", pattern: unanchored("कोड") },
  { name: "kodo (ja)", pattern: unanchored("コード") },
  { name: "yanzhengma (zh-hans)", pattern: unanchored("验证码") },
  { name: "yanzhengma (zh-hant)", pattern: unanchored("驗證碼") },
  { name: "injeung beonho (ko)", pattern: unanchored("인증번호|인증\\s?코드|코드") },
  { name: "ramz (ar)", pattern: unanchored("رمز") },
  { name: "kod (he)", pattern: unanchored("קוד") },
];

// Not gating: a context word only raises a candidate's score.
const contextWords: LexiconEntry[] = [
  { name: "verify (en, es, fr, it, pt)", pattern: prefixAnchored("v[eé]rif") },
  { name: "confirm (en, es, it, pt)", pattern: prefixAnchored("confirm") },
  { name: "bestatigung (de)", pattern: prefixAnchored("best[äa]tigung") },
  { name: "weryfikacja (pl)", pattern: prefixAnchored("weryfikacj") },
  { name: "dogrulama (tr)", pattern: prefixAnchored("do[ğg]rulama") },
  { name: "one-time (en)", pattern: wordBounded("one[-\\s]?time") },
  { name: "single-use (en)", pattern: wordBounded("single[-\\s]?use") },
  { name: "sign-in (en)", pattern: wordBounded("sign[-\\s]?(?:in|up)") },
  { name: "log-in (en)", pattern: wordBounded("log[-\\s]?in") },
  { name: "security (en)", pattern: wordBounded("security") },
  { name: "authentication (en)", pattern: prefixAnchored("authentic") },
  { name: "two-factor (en)", pattern: wordBounded("two[-\\s]?factor") },
  { name: "xac minh (vi)", pattern: prefixAnchored("x[áa]c minh") },
  { name: "podtverzhdenie (ru)", pattern: unanchored("подтвержд") },
  { name: "ninsho (ja)", pattern: unanchored("認証") },
  { name: "kakunin (ja, zh)", pattern: unanchored("確認") },
  { name: "yanzheng (zh)", pattern: unanchored("验证|驗證") },
  { name: "injeung (ko)", pattern: unanchored("인증") },
  { name: "tahaqquq (ar)", pattern: unanchored("تحقق") },
  { name: "imut (he)", pattern: unanchored("אימות") },
];

// Delivery-named codes are excluded at the gate above: they are read aloud at a
// handover, so a clipboard copy is useless and mark-read or delete would hide the
// email while it is still needed. These terms catch the rest of the topic as a
// score penalty, so a sign-in code in an email that mentions shipping survives.
const deliveryTerms: LexiconEntry[] = [
  { name: "deliver (en)", pattern: prefixAnchored("deliver") },
  { name: "pick-up (en)", pattern: wordBounded("pick[-\\s]?up") },
  { name: "collect (en)", pattern: prefixAnchored("collect") },
  { name: "ship (en)", pattern: prefixAnchored("ship") },
  { name: "track (en)", pattern: prefixAnchored("track") },
  { name: "courier (en)", pattern: wordBounded("courier") },
  { name: "dispatch (en)", pattern: prefixAnchored("dispatch") },
  { name: "lieferung (de)", pattern: prefixAnchored("liefer") },
  { name: "zustellung (de)", pattern: prefixAnchored("zustell") },
  { name: "livraison (fr)", pattern: prefixAnchored("livrais") },
  { name: "entrega (es, pt)", pattern: prefixAnchored("entrega") },
  { name: "consegna (it)", pattern: prefixAnchored("consegna") },
  { name: "dostawa (pl)", pattern: prefixAnchored("dostaw") },
  { name: "teslimat (tr)", pattern: prefixAnchored("teslim") },
  { name: "dostavka (ru)", pattern: unanchored("доставк") },
  { name: "haiso (ja)", pattern: unanchored("配送|配達") },
  { name: "kuaidi (zh)", pattern: unanchored("快递|快遞") },
  { name: "baesong (ko)", pattern: unanchored("배송") },
];

// A code word directly behind one of these names a code that is never pasted into
// a website — a discount code, a postal code, a QR code, a delivery pickup code
// read aloud to a courier — so the match doesn't open the gate. The German entries
// cover compounds such as "Rabattcode", "Gutscheincode", and "Abholcode".
const codeWordDisqualifierPrecedes = new RegExp(
  `(?:${[
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
    "pick[\\s-]?up",
    "collection",
    "abhol",
    "liefer",
    "rabatt",
    "gutschein",
    "werbe",
    "aktions",
    "empfehlungs",
    "geschenk",
  ].join("|")})[\\s-]*$`,
  "iu",
);

// Discount vocabulary anywhere in the message: a numeric promo code sitting right
// next to the word "code" is indistinguishable by shape, so the topic has to pay.
const promoTerms: LexiconEntry[] = [
  { name: "percent off (en)", pattern: unanchored("\\d\\s?%\\s?off|percent\\s?off") },
  { name: "discount (en)", pattern: prefixAnchored("discount") },
  { name: "promo (en)", pattern: prefixAnchored("promo") },
  { name: "referral (en)", pattern: prefixAnchored("referral") },
  { name: "coupon (en)", pattern: prefixAnchored("coupon") },
  { name: "voucher (en)", pattern: prefixAnchored("voucher") },
  { name: "rabatt (de)", pattern: prefixAnchored("rabatt") },
  { name: "gutschein (de)", pattern: prefixAnchored("gutschein") },
  { name: "reduction (fr)", pattern: prefixAnchored("r[ée]duction") },
  { name: "descuento (es)", pattern: prefixAnchored("descuento") },
  { name: "desconto (pt)", pattern: prefixAnchored("desconto") },
  { name: "sconto (it)", pattern: prefixAnchored("sconto") },
  { name: "skidka (ru)", pattern: unanchored("скидк") },
  { name: "zhekou (zh)", pattern: unanchored("折扣|优惠|優惠") },
  { name: "waribiki (ja)", pattern: unanchored("割引|クーポン") },
  { name: "harin (ko)", pattern: unanchored("할인|쿠폰") },
];

// Terms whose number follows them: a candidate directly behind one is never a code.
const referenceTermSources = [
  "order",
  "invoice",
  "receipt",
  "tracking",
  "shipment",
  "ticket",
  "reference",
  "ref\\.?",
  "transaction",
  "confirmation\\s+number",
  "bestell\\p{L}*",
  "auftrag\\p{L}*",
  "rechnung\\p{L}*",
  "sendungs\\p{L}*",
  "commande",
  "facture",
  "pedido",
  "encomenda",
  "factura",
  "fatura",
  "ordine",
  "fattura",
  "zam[oó]wieni\\p{L}*",
  "sipari[şs]\\p{L}*",
  "заказ\\p{L}*",
  "注文",
  "订单",
  "訂單",
  "주문",
  "الطلب",
  "הזמנה",
];

const referenceQualifierSources = [
  "number",
  "no\\.?",
  "nr\\.?",
  "num",
  "id",
  "code",
  "#",
  "番号",
  "号",
  "번호",
];

const referenceSeparator = "[\\s:#.-]{0,3}";

const referencePrecedesCandidate = new RegExp(
  `(?:#|(?<!${nonCjkLetter})(?:${referenceTermSources.join("|")})${referenceSeparator}(?:(?:${referenceQualifierSources.join("|")})${referenceSeparator})?)$`,
  "iu",
);

const currencySymbolSource = "[$€£¥₹₽₺₩¢₪﷼]";

const currencyCodeSource =
  "usd|eur|gbp|jpy|chf|cad|aud|inr|rub|brl|krw|cny|pln|sek|nok|dkk|czk|huf";

const currencyPrecedesCandidate = new RegExp(
  `(?:${currencySymbolSource}|(?<!\\p{L})(?:${currencyCodeSource}))\\s?$`,
  "iu",
);

const currencyOrPercentFollowsCandidate = new RegExp(
  `^\\s?(?:%|${currencySymbolSource}|(?:${currencyCodeSource})(?!\\p{L}))`,
  "iu",
);

const phonePunctuationPrecedesCandidate = /(?:\+[\d\s().-]{0,16}|\(\s?\d{1,5}\s?\)[\s-]{0,3})$/;

const digitRunPattern = /\d+(?:[ -]\d+)*/g;

const groupSeparatorPattern = /[ -]/;

const alphanumericPrecedesRun = new RegExp(`(?:[\\p{N}_-]|${nonCjkLetter})$`, "u");

const alphanumericFollowsRun = new RegExp(`^(?:[\\p{N}_-]|${nonCjkLetter})`, "u");

const largerNumberPrecedesRun = /\d[.,:/]$/;

const largerNumberFollowsRun = /^[.,:/]\d/;

const plausibleGroupings = new Set(["3,3", "4,4", "2,2,2", "2,2,2,2"]);

const minimumCodeLength = 4;

const maximumCodeLength = 8;

// NFKC folds full-width sentence punctuation to its ASCII shape, welding
// "493021，10分钟" into "493021,10分钟" — which then reads as one decimal number.
// These marks are never numeric separators, so they get a trailing space first.
const fullWidthPunctuationPattern = /[，。、：；！？]/g;

// NFKC folds full-width digits to ASCII but leaves these decimal scripts alone.
const nonAsciiDigitPattern = /[٠-٩۰-۹०-९]/g;

const nonAsciiDigitBlocks = [
  0x0660, // Arabic-Indic
  0x06f0, // Extended Arabic-Indic
  0x0966, // Devanagari
];

// The year veto is a static range rather than the current year: the extractor must
// stay a pure function of its inputs, with no reading of the clock.
const earliestPlausibleYear = 2000;

const latestPlausibleYear = 2099;

const proximityCharacters = 30;

const vetoWindowCharacters = 40;

const scoreThreshold = 30;

const scoreWeights = {
  codeWordWithinProximity: 60,
  codeWordInSameText: 25,
  codeWordInOtherText: 20,
  contextWordPresent: 10,
  deliveryTermPresent: -25,
  promoTermPresent: -40,
  sixDigits: 24,
  eightDigits: 16,
  groupedDigits: 16,
  fourDigits: 8,
  fiveDigits: 4,
  sevenDigits: 4,
};

export function normalizeText(text: string): string {
  return text
    .replace(fullWidthPunctuationPattern, "$& ")
    .normalize("NFKC")
    .replace(nonAsciiDigitPattern, (digit) => {
      const codePoint = digit.codePointAt(0) ?? 0;

      const blockStart = nonAsciiDigitBlocks.find(
        (start) => codePoint >= start && codePoint <= start + 9,
      );

      return blockStart === undefined ? digit : String(codePoint - blockStart);
    });
}

function hasPlausibleGrouping(groups: string[]): boolean {
  if (groups.length === 1) {
    return true;
  }

  return plausibleGroupings.has(groups.map((group) => group.length).join(","));
}

export function collectCandidates(text: string): CodeCandidate[] {
  const candidates: CodeCandidate[] = [];

  for (const match of text.matchAll(digitRunPattern)) {
    const run = match[0];
    const start = match.index;
    const end = start + run.length;

    const preceding = text.slice(Math.max(start - 2, 0), start);
    const following = text.slice(end, end + 2);

    if (alphanumericPrecedesRun.test(preceding) || alphanumericFollowsRun.test(following)) {
      continue;
    }

    if (largerNumberPrecedesRun.test(preceding) || largerNumberFollowsRun.test(following)) {
      continue;
    }

    const groups = run.split(groupSeparatorPattern);
    const digits = groups.join("");

    if (digits.length < minimumCodeLength || digits.length > maximumCodeLength) {
      continue;
    }

    if (!hasPlausibleGrouping(groups)) {
      continue;
    }

    candidates.push({ digits, groups, start, end });
  }

  return candidates;
}

function isPlausibleYear(candidate: CodeCandidate): boolean {
  if (candidate.groups.length > 1 || candidate.digits.length !== 4) {
    return false;
  }

  const year = Number(candidate.digits);

  return year >= earliestPlausibleYear && year <= latestPlausibleYear;
}

function isVetoedCandidate(candidate: CodeCandidate, text: string): boolean {
  if (isPlausibleYear(candidate)) {
    return true;
  }

  const preceding = text.slice(
    Math.max(candidate.start - vetoWindowCharacters, 0),
    candidate.start,
  );
  const following = text.slice(candidate.end, candidate.end + 6);

  if (
    currencyPrecedesCandidate.test(preceding) ||
    currencyOrPercentFollowsCandidate.test(following)
  ) {
    return true;
  }

  if (referencePrecedesCandidate.test(preceding)) {
    return true;
  }

  return phonePunctuationPrecedesCandidate.test(preceding);
}

function getFormatScore(candidate: CodeCandidate): number {
  if (candidate.groups.length > 1) {
    return scoreWeights.groupedDigits;
  }

  switch (candidate.digits.length) {
    case 6:
      return scoreWeights.sixDigits;
    case 8:
      return scoreWeights.eightDigits;
    case 4:
      return scoreWeights.fourDigits;
    case 5:
      return scoreWeights.fiveDigits;
    default:
      return scoreWeights.sevenDigits;
  }
}

function findLexiconRanges(text: string, lexicon: LexiconEntry[]): TextRange[] {
  const ranges: TextRange[] = [];

  for (const entry of lexicon) {
    for (const match of text.matchAll(entry.pattern)) {
      const start = match.index;

      ranges.push({ start, end: start + match[0].length });
    }
  }

  return ranges;
}

function matchesLexicon(texts: string[], lexicon: LexiconEntry[]): boolean {
  return texts.some((text) => findLexiconRanges(text, lexicon).length > 0);
}

function findCodeWordRanges(text: string): TextRange[] {
  return findLexiconRanges(text, codeWords).filter(
    (range) => !codeWordDisqualifierPrecedes.test(text.slice(0, range.start)),
  );
}

function getProximityScore(candidate: CodeCandidate, codeWordRanges: TextRange[]): number {
  let nearestGap = Number.POSITIVE_INFINITY;

  for (const range of codeWordRanges) {
    const gap =
      range.start >= candidate.end ? range.start - candidate.end : candidate.start - range.end;

    nearestGap = Math.min(nearestGap, Math.max(gap, 0));
  }

  if (nearestGap <= proximityCharacters) {
    return scoreWeights.codeWordWithinProximity;
  }

  if (codeWordRanges.length > 0) {
    return scoreWeights.codeWordInSameText;
  }

  return scoreWeights.codeWordInOtherText;
}

export function extractVerificationCode(texts: string[]): string | null {
  const normalizedTexts = texts.map(normalizeText);

  const codeWordRangesByText = normalizedTexts.map(findCodeWordRanges);

  if (codeWordRangesByText.every((ranges) => ranges.length === 0)) {
    return null;
  }

  const hasContextWord = matchesLexicon(normalizedTexts, contextWords);
  const hasDeliveryTerm = matchesLexicon(normalizedTexts, deliveryTerms);
  const hasPromoTerm = matchesLexicon(normalizedTexts, promoTerms);

  const messageScore =
    (hasContextWord ? scoreWeights.contextWordPresent : 0) +
    (hasDeliveryTerm ? scoreWeights.deliveryTermPresent : 0) +
    (hasPromoTerm ? scoreWeights.promoTermPresent : 0);

  let winner: { digits: string; score: number } | null = null;

  for (const [textIndex, text] of normalizedTexts.entries()) {
    for (const candidate of collectCandidates(text)) {
      if (isVetoedCandidate(candidate, text)) {
        continue;
      }

      const score =
        messageScore +
        getFormatScore(candidate) +
        getProximityScore(candidate, codeWordRangesByText[textIndex] ?? []);

      if (score < scoreThreshold) {
        continue;
      }

      if (!winner || score > winner.score) {
        winner = { digits: candidate.digits, score };
      }
    }
  }

  return winner?.digits ?? null;
}
