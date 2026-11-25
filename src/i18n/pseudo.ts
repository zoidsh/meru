import type { Messages } from "@lingui/core";

/**
 * A language only the end-to-end build has, English with accented vowels, so
 * a test can see a language change reach every string.
 */
export const PSEUDO_LANGUAGE = "en-XA";

export const PSEUDO_LANGUAGE_NAME = "Pseudo-English";

const ACCENTED: Record<string, string> = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú",
  y: "ý",
  A: "Á",
  E: "É",
  I: "Í",
  O: "Ó",
  U: "Ú",
  Y: "Ý",
};

/** The text as the pseudo-language writes it. */
export const pseudoText = (text: string) =>
  text.replaceAll(/[aeiouyAEIOUY]/gu, (vowel) => ACCENTED[vowel] ?? vowel);

type Token = string | readonly unknown[];

// A placeholder's name and type stay as they are; a plural's or select's
// choices are messages of their own.
const pseudoTokens = (tokens: readonly Token[]): Token[] =>
  tokens.map((token) => {
    if (typeof token === "string") {
      return pseudoText(token);
    }

    const [name, type, format] = token;

    if (typeof format !== "object" || format === null) {
      return token;
    }

    return [
      name,
      type,
      Object.fromEntries(
        Object.entries(format).map(([choice, message]) => [
          choice,
          Array.isArray(message) ? pseudoTokens(message as Token[]) : message,
        ])
      ),
    ];
  });

/** The compiled English catalog, every message in the pseudo-language. */
export const pseudoMessages = (english: Messages): Messages =>
  Object.fromEntries(
    Object.entries(english).map(([id, message]) => [
      id,
      typeof message === "string"
        ? pseudoText(message)
        : (pseudoTokens(message as Token[]) as typeof message),
    ])
  );
