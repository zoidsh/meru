import path from "node:path";
import { z } from "zod";

/*
 * The machine-readable half of a style sheet, `languages/<tag>.json`, which
 * `check.ts` holds a catalog against. The Markdown is the source of prose and
 * citations, except for its Platform words table, which `platform-table.ts`
 * writes from the sidecar's rows.
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
 * One word a platform uses, as the style sheet's Platform words table shows it
 * with its source: `labels` are the msgids whose whole translation is the
 * word, and `sentences` those whose translation contains it, a trailing
 * ellipsis aside. Both are compared with the catalog's access key taken out,
 * an `&` before a character or Japanese's `(&X)`, since where the key sits is
 * the translator's choice and the `accessKeys` rule checks it.
 */
const platformWord = z
  .object({
    word: z.string(),
    source: z.string().optional(),
    labels: z.array(z.string()).optional(),
    sentences: z.array(z.string()).optional(),
  })
  .strict();

/** A cell with no word, such as "macOS only", is the note the table shows. */
const platformCell = z.union([z.string(), z.array(platformWord).min(1)]);

const platformRow = z
  .object({ row: z.string(), macOS: platformCell, Windows: platformCell, Linux: platformCell })
  .strict();

export type PlatformRow = z.infer<typeof platformRow>;

/** One entry a platform word settles, as `check.ts` holds a catalog to it. */
export type PlatformEntry = { row: string; msgctxt: Platform; msgid: string } & (
  | { msgstr: string }
  | { contains: string }
);

/*
 * Picks entries by their English. A `msgctxt` of null means an entry without
 * one, and a missing `msgctxt` any. `origin` is a path prefix of a source file,
 * for a msgid that means one thing in the Gmail preload and another in the app.
 * A pattern, here and in a banned rule's `allow`, reads the English without its
 * access key, as banned and pinned patterns read the translation, since `&` can
 * split a word.
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
        // One message in one context, such as the macOS Settings menu item.
        entries: z
          .array(z.object({ msgctxt: z.string().nullable(), msgid: z.string() }).strict())
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type BannedRule = z.infer<typeof banned>;

/*
 * An entry the pin picks, with the wording it allows and a fault it catches,
 * which `scripts/translate-check.test.ts` runs every rule against. The entry
 * takes the rule's own msgid and msgctxt unless it names them, and `clean`
 * defaults to an `expect` that is one literal word, such as `^Paramètres$`.
 */
const example = z
  .object({
    msgid: z.string().optional(),
    msgctxt: z.string().nullable().optional(),
    clean: z.string().optional(),
    fault: z.string(),
  })
  .strict();

const pinned = z
  .object({
    id: z.string(),
    ...selector,
    expect: pattern,
    severity,
    reason: z.string(),
    example,
  })
  .strict()
  .refine((rule) => rule.msgid !== undefined || rule.msgidPattern !== undefined, {
    message: "a pinned rule needs msgid or msgidPattern",
  })
  .refine((rule) => rule.msgid !== undefined || rule.example.msgid !== undefined, {
    message: "a pinned rule picked by msgidPattern needs its example's msgid",
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
    platformWords: z.object({ severity, reason: z.string(), rows: z.array(platformRow) }).strict(),
    banned: z.array(banned),
    pinned: z.array(pinned),
    accessKeys: accessKeys.nullable(),
    families: z.array(family),
  })
  .strict()
  .superRefine((sidecar, context) => {
    for (const id of duplicateRuleIds(sidecar)) {
      context.addIssue({ code: "custom", message: `rule id “${id}” is used more than once` });
    }
  });

/*
 * A finding names its rule by id, and so do a fixture's `# fault:` marks and a
 * regression set's `# check:` marks, so two rules sharing one can each hide
 * the other's untested fault.
 */
export function duplicateRuleIds(sidecar: {
  banned: { id: string }[];
  pinned: { id: string }[];
  families: { id: string }[];
}) {
  const seen = new Set<string>();

  const duplicates = new Set<string>();

  for (const { id } of [...sidecar.banned, ...sidecar.pinned, ...sidecar.families]) {
    if (seen.has(id)) {
      duplicates.add(id);
    }

    seen.add(id);
  }

  return [...duplicates];
}

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

/** Every entry the Platform words rows settle, in table order. */
export function platformEntries(sidecar: Sidecar): PlatformEntry[] {
  return sidecar.platformWords.rows.flatMap((row) =>
    PLATFORMS.flatMap((platform) => {
      const cell = row[platform];

      if (typeof cell === "string") {
        return [];
      }

      return cell.flatMap(({ word, labels = [], sentences = [] }) => [
        ...labels.map((msgid) => ({ row: row.row, msgctxt: platform, msgid, msgstr: word })),
        ...sentences.map((msgid) => ({
          row: row.row,
          msgctxt: platform,
          msgid,
          contains: word.replace(/[\s\u00a0]*…$/u, ""),
        })),
      ]);
    }),
  );
}

export type PinExample = {
  id: string;
  msgctxt: string | null;
  msgid: string;
  origin: string | undefined;
  clean: string | undefined;
  fault: string;
};

/** The word an `expect` such as `^Paramètres$` allows, when it allows only one. */
function literalExpect(expect: string) {
  return /^\^([^\\^$.*+?()[\]{}|]*)\$$/u.exec(expect)?.[1];
}

/** Each pin's example as the entry it stands for, every default filled in. */
export function pinExamples(sidecar: Sidecar): PinExample[] {
  return sidecar.pinned.map((rule) => ({
    id: rule.id,
    msgctxt: rule.example.msgctxt !== undefined ? rule.example.msgctxt : (rule.msgctxt ?? null),
    msgid: rule.example.msgid ?? (rule.msgid as string),
    origin: rule.origin,
    clean: rule.example.clean ?? literalExpect(rule.expect),
    fault: rule.example.fault,
  }));
}
