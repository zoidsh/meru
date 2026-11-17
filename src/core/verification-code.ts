import {
  CODE_WORDS,
  CONTEXT_WORDS,
  CURRENCIES,
  DELIVERY_WORDS,
  NUMBER_WORDS,
  ORDER_WORDS,
  OTHER_KINDS_AFTER,
  OTHER_KINDS_BEFORE,
  PHONE_WORDS,
  PROMO_WORDS,
  REFERENCE_WORDS,
  STANDING_WORDS,
  TIME_AFTER,
  TIME_BEFORE,
  UNIT_ADJECTIVES,
  UNITS,
} from "./verification-code.lexicon.ts";
import type { LexiconEntry } from "./verification-code.lexicon.ts";

/** A text longer than this after normalising is not read at all. */
export const MAX_TEXT_LENGTH = 1000;

const WEIGHTS = {
  close: 6.5,
  sameText: 4.5,
  otherText: 2.5,
  sixDigits: 3,
  eightDigitsOrGroups: 2.5,
  otherLengths: 1.5,
  twoPairs: 1,
  context: 3,
  topicInSentence: -4,
  topicElsewhere: -0.5,
};

// Halfway between the corpora's best-scoring number that is no code (5.5)
// and their worst-scoring code (7), so that neither sits on the line.
const THRESHOLD = 6.5;

/** How far, in characters within one sentence, a code word counts as close. */
const CLOSE_GAP = 24;

/** How much text either side of a match the anchored checks look at. */
const LOOK = 48;

interface Span {
  start: number;
  end: number;
  sentence: number;
}

interface Reading {
  text: string;
  sentenceAt: (index: number) => number;
  /** Code words that name a one-time code, not another kind. */
  open: Span[];
  /** Words of deliveries, promotions, orders and standing codes. */
  topics: Span[];
  hasContext: boolean;
}

interface Candidate extends Span {
  reading: Reading;
  digits: string;
  groups: string[];
}

const NOT_BEFORE = String.raw`(?<![\p{L}\p{M}\p{N}])`;
const NOT_AFTER = String.raw`(?![\p{L}\p{M}\p{N}])`;

const anchored = ({ source, anchor }: LexiconEntry) =>
  new RegExp(
    `${anchor === "word" || anchor === "start" ? NOT_BEFORE : ""}(?:${source})${
      anchor === "word" || anchor === "end" ? NOT_AFTER : ""
    }`,
    "giu"
  );

const anyOf = (sources: readonly string[]) => sources.join("|");

const CODE_WORD_PATTERNS = CODE_WORDS.map(anchored);
const CONTEXT_PATTERNS = CONTEXT_WORDS.map(anchored);
const TOPIC_PATTERNS = [
  ...DELIVERY_WORDS,
  ...PROMO_WORDS,
  ...ORDER_WORDS,
  ...STANDING_WORDS,
].map(anchored);

// A German compound writes the kind straight onto the code word, so the
// separator is optional.
const OTHER_KIND_BEFORE = new RegExp(
  `${NOT_BEFORE}(?:${anyOf(OTHER_KINDS_BEFORE)})[\\s-]*$`,
  "iu"
);
const OTHER_KIND_AFTER = new RegExp(
  String.raw`^[\s:]*(?:(?:de la|de|del|du|des|di|della|do|da|of)\s+)?(?:${anyOf(
    OTHER_KINDS_AFTER
  )})${NOT_AFTER}`,
  "iu"
);

const REFERENCE_BEFORE = new RegExp(
  `${NOT_BEFORE}(?:${anyOf(REFERENCE_WORDS)})(?:\\s*(?:${anyOf(
    NUMBER_WORDS
  )})){0,3}\\s*$`,
  "iu"
);
const PHONE_BEFORE = new RegExp(
  `${NOT_BEFORE}(?:${anyOf(
    PHONE_WORDS
  )})(?:\\s+(?:us|me))?(?:\\s+(?:at|on))?\\s*:?\\s*$`,
  "iu"
);
const CURRENCY_BEFORE = new RegExp(`(?:${anyOf(CURRENCIES)})\\s?$`, "iu");
const CURRENCY_AFTER = new RegExp(`^\\s?(?:${anyOf(CURRENCIES)}|%)`, "iu");
const TIME_BEFORE_PATTERN = new RegExp(
  `${NOT_BEFORE}(?:${anyOf(TIME_BEFORE)})\\s+$`,
  "iu"
);
const TIME_AFTER_PATTERN = new RegExp(
  `^\\s?(?:${anyOf(TIME_AFTER)})${NOT_AFTER}`,
  "iu"
);
// Without the `i` flag: see `UNITS`.
const UNIT_AFTER = new RegExp(
  `^\\s(?:(?:${anyOf(UNIT_ADJECTIVES)})\\s)?(?:${anyOf(UNITS)})${NOT_AFTER}`,
  "u"
);
const LATIN_LETTER = /\p{Script=Latin}|_/u;

const SENTENCE_BREAK = /[.!?](?=\s|$)|[。！？।\n]/gu;
const RUN = /\d+(?:[ -]\d+)*/gu;

// NFKC folds full-width digits but leaves these scripts' own digits alone.
const NATIVE_DIGIT = /[٠-٩۰-۹०-९]/gu;
const NATIVE_ZEROS = [0x09_66, 0x06_f0, 0x06_60];

const toAsciiDigit = (digit: string) => {
  const point = digit.codePointAt(0) ?? 0;

  return String(point - (NATIVE_ZEROS.find((zero) => point >= zero) ?? 0));
};

const normalise = (text: string) =>
  text.normalize("NFKC").replaceAll(NATIVE_DIGIT, toAsciiDigit);

const before = (text: string, at: number) =>
  text.slice(Math.max(0, at - LOOK), at);

const after = (text: string, at: number) => text.slice(at, at + LOOK);

const namesAnotherKind = (text: string, word: Span) =>
  OTHER_KIND_BEFORE.test(before(text, word.start)) ||
  OTHER_KIND_AFTER.test(after(text, word.end));

// Cutting a long text instead could split a run of digits into a shorter
// one that looks like a code, so a long text is not read at all.
const read = (raw: string): Reading => {
  const normalised = normalise(raw);
  const text = normalised.length > MAX_TEXT_LENGTH ? "" : normalised;
  const breaks = [...text.matchAll(SENTENCE_BREAK)].map(({ index }) => index);
  const sentenceAt = (index: number) =>
    breaks.filter((at) => at < index).length;
  const find = (patterns: readonly RegExp[]): Span[] =>
    patterns.flatMap((pattern) =>
      [...text.matchAll(pattern)].map(({ index, 0: match }) => ({
        start: index,
        end: index + match.length,
        sentence: sentenceAt(index),
      }))
    );

  return {
    text,
    sentenceAt,
    open: find(CODE_WORD_PATTERNS).filter(
      (word) => !namesAnotherKind(text, word)
    ),
    topics: find(TOPIC_PATTERNS),
    hasContext: find(CONTEXT_PATTERNS).length > 0,
  };
};

const isPlausible = (groups: readonly string[], digits: string) => {
  const [first = ""] = groups;

  return (
    digits.length >= 4 &&
    digits.length <= 8 &&
    (groups.length === 1 ||
      (first.length >= 2 &&
        first.length <= 4 &&
        groups.every((group) => group.length === first.length)))
  );
};

const candidatesOf = (reading: Reading): Candidate[] =>
  [...reading.text.matchAll(RUN)].flatMap(({ index, 0: run }) => {
    const groups = run.split(/[ -]/u);
    const digits = groups.join("");

    return isPlausible(groups, digits)
      ? [
          {
            reading,
            digits,
            groups,
            start: index,
            end: index + run.length,
            sentence: reading.sentenceAt(index),
          },
        ]
      : [];
  });

const isTimeOfDay = (digits: string) =>
  digits.length === 4 &&
  Number(digits.slice(0, 2)) < 24 &&
  Number(digits.slice(2)) < 60;

const hasLetterPrefix = (prefix: string) =>
  LATIN_LETTER.test(prefix.slice(-1)) ||
  // Google writes its codes as G-123456; any other letters and a hyphen
  // make an identifier such as a room, a version or a SKU.
  (/\p{Script=Latin}-$/u.test(prefix) && !/(?<!\p{L})G-$/u.test(prefix));

interface Veto {
  why: string;
  applies: (candidate: Candidate, prefix: string, suffix: string) => boolean;
}

/** Candidates rejected whatever they score. */
const VETOES: readonly Veto[] = [
  {
    why: "a year",
    applies: ({ digits, groups }) =>
      groups.length === 1 && /^20\d\d$/u.test(digits),
  },
  {
    why: "a price or a percentage",
    applies: (_candidate, prefix, suffix) =>
      CURRENCY_BEFORE.test(prefix) || CURRENCY_AFTER.test(suffix),
  },
  {
    why: "part of a decimal, a date, a time or a path",
    // A comma after the run is left out: NFKC makes a CJK comma one, and
    // "493021，10分钟内有效" is a code followed by its lifetime.
    applies: (_candidate, prefix, suffix) =>
      /\d[.,:/]$/u.test(prefix) || /^[.:/]\d/u.test(suffix),
  },
  {
    why: "a reference, an account or a card ending",
    applies: (_candidate, prefix) => REFERENCE_BEFORE.test(prefix),
  },
  {
    why: "a number behind #, unless a code word names it",
    applies: ({ reading, start }, prefix) => {
      const hash = /#\s?$/u.exec(prefix);

      if (hash === null) {
        return false;
      }
      const at = start - hash[0].length;

      return !reading.open.some(
        (word) => at - word.end >= 0 && at - word.end <= 2
      );
    },
  },
  {
    why: "typed at a keypad or a phone, ending in #",
    applies: (_candidate, _prefix, suffix) => /^\s?#/u.test(suffix),
  },
  {
    why: "a phone number",
    applies: (_candidate, prefix) =>
      PHONE_BEFORE.test(prefix) || /\+\s?$/u.test(prefix),
  },
  {
    why: "a count of something",
    applies: (_candidate, _prefix, suffix) => UNIT_AFTER.test(suffix),
  },
  {
    why: "part of an identifier with letters",
    applies: (_candidate, prefix, suffix) =>
      hasLetterPrefix(prefix) ||
      LATIN_LETTER.test(suffix.charAt(0)) ||
      /^-\p{Script=Latin}/u.test(suffix),
  },
  {
    why: "a time of day",
    applies: ({ digits }, prefix, suffix) =>
      isTimeOfDay(digits) &&
      (TIME_BEFORE_PATTERN.test(prefix) || TIME_AFTER_PATTERN.test(suffix)),
  },
];

const isVetoed = (candidate: Candidate) => {
  const { text } = candidate.reading;
  const prefix = before(text, candidate.start);
  const suffix = after(text, candidate.end);

  return VETOES.some((veto) => veto.applies(candidate, prefix, suffix));
};

const isClose = (word: Span, candidate: Span) =>
  word.sentence === candidate.sentence &&
  Math.max(word.start - candidate.end, candidate.start - word.end) <= CLOSE_GAP;

const proximity = (candidate: Candidate, other: Reading) => {
  const { open } = candidate.reading;

  if (open.some((word) => isClose(word, candidate))) {
    return WEIGHTS.close;
  }
  if (open.length > 0) {
    return WEIGHTS.sameText;
  }

  return other.open.length > 0 ? WEIGHTS.otherText : 0;
};

const formatPrior = ({ digits, groups }: Candidate) => {
  if (groups.length > 1) {
    return digits.length === 4 ? WEIGHTS.twoPairs : WEIGHTS.eightDigitsOrGroups;
  }
  if (digits.length === 6) {
    return WEIGHTS.sixDigits;
  }

  return digits.length === 8
    ? WEIGHTS.eightDigitsOrGroups
    : WEIGHTS.otherLengths;
};

// A subject says what the whole mail is about, so a topic word there weighs
// as if it sat in the candidate's own sentence.
const topicPenalty = (candidate: Candidate, readings: readonly Reading[]) => {
  const [subject] = readings;

  if (
    (subject?.topics.length ?? 0) > 0 ||
    candidate.reading.topics.some(
      (word) => word.sentence === candidate.sentence
    )
  ) {
    return WEIGHTS.topicInSentence;
  }

  return readings.some((reading) => reading.topics.length > 0)
    ? WEIGHTS.topicElsewhere
    : 0;
};

const score = (candidate: Candidate, readings: readonly Reading[]) => {
  const other =
    readings.find((reading) => reading !== candidate.reading) ??
    candidate.reading;

  return (
    proximity(candidate, other) +
    formatPrior(candidate) +
    (readings.some((reading) => reading.hasContext) ? WEIGHTS.context : 0) +
    topicPenalty(candidate, readings)
  );
};

/**
 * The digits of the one-time code in `[subject, summary]`, as Gmail's feed
 * gives them (the summary a snippet often cut mid-sentence), separators taken
 * out, or `undefined` when there is none. Pure, with no settings; the words it
 * reads are in `verification-code.lexicon.ts`, and its behaviour is the design
 * record's, `features/verification-codes.md`.
 */
export const extractVerificationCode = (
  texts: readonly string[]
): string | undefined => {
  const [subject = "", summary = ""] = texts;
  const readings = [read(subject), read(summary)];

  if (readings.every((reading) => reading.open.length === 0)) {
    return undefined;
  }

  let best: { digits: string; score: number } | undefined;

  for (const candidate of readings.flatMap(candidatesOf)) {
    if (isVetoed(candidate)) {
      continue;
    }
    const total = score(candidate, readings);

    // Strictly greater, so a tie goes to the earlier candidate.
    if (total >= THRESHOLD && (best === undefined || total > best.score)) {
      best = { digits: candidate.digits, score: total };
    }
  }

  return best?.digits;
};
