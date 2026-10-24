import path from "node:path";
import { z } from "zod";

/*
 * The machine-readable half of a style sheet, `languages/<tag>.json`, which
 * `check.ts` holds a catalog against. The Markdown stays the source of prose
 * and citations; `rules.test.ts` keeps its Platform words table and this file
 * in step.
 */

export const PLATFORMS = ["macOS", "Windows", "Linux"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const LANGUAGES_DIR = path.join(import.meta.dir, "languages");

const severity = z.enum(["wrong", "doubtful", "style"]);

export type Severity = z.infer<typeof severity>;

function isPattern(source: string) {
  try {
    new RegExp(source, "u");

    return true;
  } catch {
    return false;
  }
}

const pattern = z.string().min(1).refine(isPattern, { message: "not a valid regular expression" });

/*
 * `msgstr` is the whole expected translation and `contains` the platform's word
 * inside a sentence. Both are compared with the catalog's access key taken out,
 * an `&` before a character or Japanese's `(&X)`, since where the key sits is
 * the translator's choice and the `accessKeys` rule checks it.
 */
const platformWord = z.union([
  z
    .object({
      row: z.string(),
      msgctxt: z.enum(PLATFORMS),
      msgid: z.string(),
      msgstr: z.string(),
    })
    .strict(),
  z
    .object({
      row: z.string(),
      msgctxt: z.enum(PLATFORMS),
      msgid: z.string(),
      contains: z.string(),
    })
    .strict(),
]);

export type PlatformWord = z.infer<typeof platformWord>;

/*
 * Picks entries by their English. A `msgctxt` of null means an entry without
 * one, and a missing `msgctxt` any. `origin` is a path prefix of a source file,
 * for a msgid that means one thing in the Gmail preload and another in the app.
 */
const selector = {
  msgid: z.string().optional(),
  msgidPattern: pattern.optional(),
  msgctxt: z.string().nullable().optional(),
  origin: z.string().optional(),
};

const banned = z
  .object({
    id: z.string(),
    pattern,
    severity,
    reason: z.string(),
    allow: z
      .object({
        contexts: z.array(z.string()).optional(),
        msgids: z.array(z.string()).optional(),
        msgidPattern: pattern.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type BannedRule = z.infer<typeof banned>;

const pinned = z
  .object({
    id: z.string(),
    ...selector,
    expect: pattern,
    severity,
    reason: z.string(),
  })
  .strict()
  .refine((rule) => rule.msgid !== undefined || rule.msgidPattern !== undefined, {
    message: "a pinned rule needs msgid or msgidPattern",
  });

export type PinnedRule = z.infer<typeof pinned>;

const accessKeys = z
  .object({
    style: z.enum(["inline", "suffix"]),
    severity,
    reason: z.string(),
  })
  .strict();

export type AccessKeyRule = z.infer<typeof accessKeys>;

const family = z
  .object({
    id: z.string(),
    severity,
    reason: z.string(),
    groups: z.array(
      z
        .object({
          name: z.string(),
          case: z.enum(["lower", "capitalized"]),
          entries: z.array(
            z.object({ msgid: z.string(), msgctxt: z.enum(PLATFORMS).optional() }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export type FamilyRule = z.infer<typeof family>;

export const sidecarSchema = z
  .object({
    platformWords: z
      .object({ severity, reason: z.string(), entries: z.array(platformWord) })
      .strict(),
    banned: z.array(banned),
    pinned: z.array(pinned),
    accessKeys: accessKeys.nullable(),
    families: z.array(family),
  })
  .strict();

export type Sidecar = z.infer<typeof sidecarSchema>;

export function sidecarPath(locale: string) {
  return path.join(LANGUAGES_DIR, `${locale}.json`);
}

export function styleSheetPath(locale: string) {
  return path.join(LANGUAGES_DIR, `${locale}.md`);
}

export async function loadSidecar(locale: string) {
  return sidecarSchema.parse(await Bun.file(sidecarPath(locale)).json());
}

export type PlatformTableRow = {
  english: string;
  words: Record<Platform, string[]>;
};

/*
 * The tables write a plain space before an ellipsis where the catalogs, as the
 * style sheet says, have a no-break space.
 */
export function toCatalogForm(word: string) {
  return word.replace(/ …/gu, "\u00a0…");
}

/** A cell's words, each the italic span that opens a `; `-separated part. */
function cellWords(cell: string) {
  const masked = cell.replace(/`[^`]*`/gu, (code) => "§".repeat(code.length));

  const parts: string[] = [];

  let depth = 0;

  let start = 0;

  for (let index = 0; index < masked.length; index++) {
    const character = masked[index];

    if (character === "(") {
      depth++;
    } else if (character === ")") {
      depth--;
    } else if (character === ";" && depth === 0) {
      parts.push(masked.slice(start, index));

      start = index + 1;
    }
  }

  parts.push(masked.slice(start));

  return parts.flatMap((part) => {
    const word = /^_(.+?)_(?=[\s,;)]|$)/u.exec(part.trim())?.[1];

    return word ? [toCatalogForm(word)] : [];
  });
}

/** The rows of a style sheet's Platform words table, empty where it has none. */
export function readPlatformTable(markdown: string): PlatformTableRow[] {
  const section = markdown.split(/^## /mu).find((part) => part.startsWith("Platform words"));

  if (!section) {
    return [];
  }

  const lines = section.split("\n").filter((line) => line.startsWith("|"));

  return lines.slice(2).map((line) => {
    const [english = "", ...cells] = line.split("|").slice(1, -1);

    return {
      english: english.trim(),
      words: Object.fromEntries(
        PLATFORMS.map((platform, index) => [platform, cellWords(cells[index] ?? "")]),
      ) as Record<Platform, string[]>,
    };
  });
}
