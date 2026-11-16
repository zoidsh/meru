/**
 * Every language Meru has a catalog for, as a BCP 47 tag, English first.
 * Adding one is its tag here and its catalog in `index.ts`.
 */
export const LANGUAGES = ["en"] as const;

export type Language = (typeof LANGUAGES)[number];

const primarySubtag = (tag: string) => tag.split("-")[0];

/**
 * The first of `available` to match a preferred tag, exactly or by its primary
 * language subtag, or the first of `available` when none does.
 *
 * One preferred tag at a time, so a closer match further down the list never
 * beats the user's first choice.
 */
export const matchLanguage = <T extends string>(
  preferred: readonly string[],
  available: readonly [T, ...T[]]
): T => {
  for (const tag of preferred) {
    // Linux hands over POSIX names such as `de_DE.UTF-8` or `sr@latin`.
    const normalized = tag
      .replace(/[.@].*$/u, "")
      .replaceAll("_", "-")
      .toLowerCase();
    const match =
      available.find((language) => language.toLowerCase() === normalized) ??
      available.find(
        (language) =>
          primarySubtag(language.toLowerCase()) === primarySubtag(normalized)
      );

    if (match) {
      return match;
    }
  }

  return available[0];
};

/** The language to show for the system's preferred tags, English at worst. */
export const resolveLanguage = (preferred: readonly string[]): Language =>
  matchLanguage(preferred, LANGUAGES);
