import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { getConfig, type LinguiConfigNormalized } from "@lingui/conf";
import { formatter } from "@lingui/format-po";
import { extractString, formatKeyword } from "pofile-ts";
import { CATALOG_TAGS } from "../../../packages/shared/i18n/tags";

/*
 * Lists, per locale, the entries a translator has to write, each with the old
 * translation of the English it replaces when one can be found. A changed
 * English is a new entry, so the old one is only obsolete in the catalog, or
 * gone from it once `extract --clean` has run, which is why the catalog is also
 * read as `HEAD` and as the merge base with `--base` have it. When nothing is
 * untranslated or fuzzy, it lists every translation changed since that merge
 * base instead, since a translation edited by hand still needs its review.
 *
 * With `--out <dir>`, each locale's list goes to `<dir>/<tag>.txt` instead,
 * with that locale's slice of the glossary beside it, so an agent reads one
 * language rather than every one. `<tag> --apply <json>` writes translations
 * into a locale's catalogs, and `--dump <tag> --out <dir>` writes its whole
 * catalog for review.
 */

type Entry = {
  message?: string;
  translation?: string;
  context?: string;
  comments?: string[];
  obsolete?: boolean;
  origin?: [string, number | null][];
  extra?: { flags?: string[] };
};

export type Catalog = Record<string, Entry>;

type PriorArt = { source: string; translation: string; match: string };

const SIMILARITY_THRESHOLD = 0.6;

const SHARED_COMMENT_THRESHOLD = 0.4;

const po = formatter({ lineNumbers: false });

function bigrams(text: string) {
  const normalized = text.toLowerCase();

  const counts = new Map<string, number>();

  for (let index = 0; index < normalized.length - 1; index++) {
    const pair = normalized.slice(index, index + 2);

    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }

  return counts;
}

function similarity(a: string, b: string) {
  const left = bigrams(a);
  const right = bigrams(b);

  let shared = 0;

  for (const [pair, count] of left) {
    shared += Math.min(count, right.get(pair) ?? 0);
  }

  const total = Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0);

  return total === 0 ? 0 : (2 * shared) / total;
}

function keyOf(id: string, entry: Entry) {
  return `${entry.context ?? ""}\u0004${entry.message ?? id}`;
}

function sameComment(a: Entry, b: Entry) {
  const comments = (a.comments ?? []).join("\n");

  return comments !== "" && comments === (b.comments ?? []).join("\n");
}

/*
 * A comment is often shared by a whole block of strings, such as "Menu item"
 * or a `lingui-set comment`, so it never picks a pairing on its own. It only
 * lowers the bar and breaks a tie. Pairs are taken best first and each side at
 * most once, so two reworded strings never inherit the same old translation.
 */
function assignPriorArt(pending: [string, Entry][], candidates: [string, Entry][]) {
  const pairs: { pendingId: string; candidate: [string, Entry]; score: number; shared: boolean }[] =
    [];

  for (const [pendingId, entry] of pending) {
    for (const candidate of candidates) {
      const [candidateId, candidateEntry] = candidate;

      if ((candidateEntry.context ?? "") !== (entry.context ?? "")) {
        continue;
      }

      const score = similarity(entry.message ?? pendingId, candidateEntry.message ?? candidateId);

      const shared = sameComment(entry, candidateEntry);

      if (score >= (shared ? SHARED_COMMENT_THRESHOLD : SIMILARITY_THRESHOLD)) {
        pairs.push({ pendingId, candidate, score, shared });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score || Number(b.shared) - Number(a.shared));

  const assigned = new Map<string, PriorArt>();

  const usedCandidates = new Set<string>();

  for (const { pendingId, candidate, score, shared } of pairs) {
    const [candidateId, candidateEntry] = candidate;

    if (assigned.has(pendingId) || usedCandidates.has(candidateId)) {
      continue;
    }

    usedCandidates.add(candidateId);

    assigned.set(pendingId, {
      source: candidateEntry.message ?? candidateId,
      translation: candidateEntry.translation ?? "",
      match: `similar English (${score.toFixed(2)})${shared ? ", same comment" : ""}`,
    });
  }

  return assigned;
}

export async function parse(text: string, locale: string, sourceLocale: string, filename: string) {
  return (await po.parse(text, { locale, sourceLocale, filename })) as Catalog;
}

export function readAtRef(ref: string, file: string) {
  const result = Bun.spawnSync(["git", "show", `${ref}:${file}`], { stderr: "ignore" });

  return result.success ? result.stdout.toString() : undefined;
}

/** The branch a translation run merges into when `--base` names none. */
export const DEFAULT_BASE = "beta";

function gitOutput(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { stderr: "ignore" });

  return result.success ? result.stdout.toString().trim() : undefined;
}

/*
 * A branch and its remote-tracking twin, such as `beta` and `origin/beta`, can
 * disagree: a worktree rebased onto a local `beta` newer than the last fetch
 * forks from a commit `origin/beta` doesn't hold, and after a fetch the stale
 * one is the local branch. Of the two merge bases, the one nearest HEAD is
 * where the branch itself starts; the older would count the target's own
 * commits as the branch's changes.
 */
export function mergeBase(ref: string) {
  const twin = ref.startsWith("origin/") ? ref.slice("origin/".length) : `origin/${ref}`;

  let newest: string | undefined;

  for (const candidate of [ref, twin]) {
    const commit = gitOutput("merge-base", "HEAD", candidate);

    if (
      commit &&
      (!newest ||
        (commit !== newest &&
          gitOutput("merge-base", "--is-ancestor", newest, commit) !== undefined))
    ) {
      newest = commit;
    }
  }

  return newest;
}

export type AssessedEntry = { catalog: string; msgctxt: string | null; msgid: string };

/** Every live, translated entry whose translation is new since `earlier` or differs from it. */
export function translationChanges(catalog: Catalog, earlier: Catalog) {
  const before = new Map(Object.entries(earlier).map(([id, entry]) => [keyOf(id, entry), entry]));

  return Object.entries(catalog).flatMap(([id, entry]) => {
    const previous = before.get(keyOf(id, entry));

    return !entry.obsolete &&
      entry.translation &&
      (!previous || previous.obsolete || previous.translation !== entry.translation)
      ? [{ id, entry, previous: previous?.obsolete ? undefined : previous }]
      : [];
  });
}

/*
 * A partial run's translator writes more than the new and fuzzy entries: a
 * `check.ts` fix or a new pin can rewrite an older one, and that rewrite needs
 * assessing as much as a new string does.
 */
export function changedEntries(
  catalogs: { name: string; catalog: Catalog }[],
  earlier: { name: string; catalog: Catalog }[],
): AssessedEntry[] {
  return catalogs.flatMap(({ name, catalog }) =>
    translationChanges(catalog, earlier.find((other) => other.name === name)?.catalog ?? {}).map(
      ({ id, entry }) => ({
        catalog: name,
        msgctxt: entry.context ?? null,
        msgid: entry.message ?? id,
      }),
    ),
  );
}

const GLOSSARY_PATH = path.join(import.meta.dir, "glossary.md");

const LOCALE_BULLET = /^[-*] ([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*): /;

/** A bullet that starts like a locale's but in another form, such as `- **de**:` or `- de (Apple):`. */
const TAG_LIKE_BULLET = /^[-*+] (?:\*\*|_)?[a-z]{2,3}(?:-[A-Za-z0-9]+)*(?:\*\*|_)?(?: \([^)]*\))?:/;

/*
 * Drops only the other locales' `- <tag>:` bullets, keeping every heading,
 * paragraph and general rule, lists included. What might hold another
 * language's words in a shape it can't split, a table, a code block or a
 * bullet whose tag it doesn't recognise, is dropped with a warning rather than
 * guessed at, so a change to the glossary's shape shows up instead of leaking
 * every language into the slice or losing one.
 */
export function sliceGlossary(
  markdown: string,
  locale: string,
  tags: readonly string[] = CATALOG_TAGS,
) {
  const kept: string[] = [];

  const warnings: string[] = [];

  let inFence = false;

  let droppingBullet = false;

  for (const [index, line] of markdown.split("\n").entries()) {
    const skip = () =>
      warnings.push(`glossary.md:${index + 1}: skipped ${JSON.stringify(line.slice(0, 60))}`);

    if (line.trimStart().startsWith("```")) {
      if (!inFence) {
        skip();
      }

      inFence = !inFence;

      droppingBullet = false;

      continue;
    }

    if (inFence || (droppingBullet && /^\s+\S/.test(line))) {
      continue;
    }

    const tag = LOCALE_BULLET.exec(line)?.[1];

    droppingBullet = false;

    if (tag && tags.includes(tag)) {
      droppingBullet = tag !== locale;
    } else if (TAG_LIKE_BULLET.test(line) || /^\s*\|/.test(line)) {
      skip();

      droppingBullet = true;
    }

    if (!droppingBullet) {
      kept.push(line);
    }
  }

  return {
    text: `${kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()}\n`,
    warnings,
  };
}

export type Translation = { msgctxt?: string; msgid: string; msgstr: string };

type PoEntry = {
  context?: string;
  id: string;
  plural: boolean;
  flags?: { line: number; values: string[] };
  msgstrStart: number;
  msgstrEnd: number;
};

function append<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const values = map.get(key);

  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
  }
}

function entryKey(context: string | undefined, id: string) {
  return JSON.stringify([context ?? null, id]);
}

function describe({ msgctxt, msgid }: Translation) {
  return msgctxt === undefined
    ? JSON.stringify(msgid)
    : `${JSON.stringify(msgid)} with msgctxt ${JSON.stringify(msgctxt)}`;
}

function readString(lines: string[], start: number) {
  let value = "";

  let next = start;

  do {
    value += extractString(lines[next] ?? "");
    next++;
  } while (lines[next]?.startsWith('"'));

  return { value, next };
}

/** The live entries of a PO file, by line, skipping the header and obsolete `#~` entries. */
function poEntries(lines: string[]) {
  const entries: PoEntry[] = [];

  let entry: Partial<PoEntry> = {};

  let obsolete = false;

  const finish = () => {
    if (entry.id && !obsolete && (entry.plural || entry.msgstrStart !== undefined)) {
      entries.push({ plural: false, ...entry } as PoEntry);
    }

    entry = {};
    obsolete = false;
  };

  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    const keyword = /^(msgctxt|msgid|msgstr) "/.exec(line)?.[1];

    if (keyword) {
      const { value, next } = readString(lines, index);

      if (keyword === "msgctxt") {
        entry.context = value;
      } else if (keyword === "msgid") {
        entry.id = value;
      } else {
        entry.msgstrStart = index;
        entry.msgstrEnd = next;
      }

      index = next;

      continue;
    }

    if (line === "") {
      finish();
    } else if (line.startsWith("#~")) {
      obsolete = true;
    } else if (line.startsWith("#,")) {
      entry.flags = {
        line: index,
        values: line
          .slice(2)
          .split(",")
          .map((flag) => flag.trim())
          .filter(Boolean),
      };
    } else if (line.startsWith("msgid_plural ") || line.startsWith("msgstr[")) {
      entry.plural = true;
    }

    index++;
  }

  finish();

  return entries;
}

/*
 * Edits the PO text line by line rather than through a parse and a serialize,
 * so every line it doesn't write, the comments, origins and obsolete entries
 * included, stays byte for byte as extract wrote it. The `msgstr` is formatted
 * the way Lingui's formatter writes one, with no folding, so `lingui check
 * sync` finds nothing to change. Nothing is written unless every translation
 * names exactly one entry.
 */
export function applyTranslations(text: string, translations: Translation[]) {
  const lines = text.split("\n");

  const entries = poEntries(lines);

  const byKey = new Map<string, PoEntry[]>();

  for (const entry of entries) {
    const key = entryKey(entry.context, entry.id);

    append(byKey, key, entry);
  }

  const errors: string[] = [];

  const edits: { entry: PoEntry; msgstr: string }[] = [];

  const seen = new Set<string>();

  for (const translation of translations) {
    const key = entryKey(translation.msgctxt, translation.msgid);

    const matches = byKey.get(key) ?? [];

    const [match] = matches;

    if (seen.has(key)) {
      errors.push(`${describe(translation)} is given more than once`);
    } else if (!match) {
      const contexts = entries
        .filter((entry) => entry.id === translation.msgid)
        .map((entry) => (entry.context === undefined ? "none" : JSON.stringify(entry.context)));

      errors.push(
        `${describe(translation)} matches no entry${contexts.length > 0 ? `; that msgid has msgctxt ${contexts.join(", ")}` : ""}`,
      );
    } else if (matches.length > 1) {
      errors.push(`${describe(translation)} matches ${matches.length} entries`);
    } else if (match.plural) {
      errors.push(`${describe(translation)} is a gettext plural, which Lingui never writes`);
    } else {
      edits.push({ entry: match, msgstr: translation.msgstr });
    }

    seen.add(key);
  }

  if (errors.length > 0) {
    return { errors };
  }

  edits.sort((a, b) => b.entry.msgstrStart - a.entry.msgstrStart);

  for (const { entry, msgstr } of edits) {
    lines.splice(
      entry.msgstrStart,
      entry.msgstrEnd - entry.msgstrStart,
      ...formatKeyword("msgstr", msgstr, undefined, { foldLength: 0 }),
    );

    if (!entry.flags?.values.includes("fuzzy")) {
      continue;
    }

    const kept = entry.flags.values.filter((flag) => flag !== "fuzzy");

    lines.splice(entry.flags.line, 1, ...(kept.length > 0 ? [`#, ${kept.join(",")}`] : []));
  }

  return { text: lines.join("\n"), errors };
}

const CATALOG_NAMES: Record<string, string> = {
  "packages/shared/i18n/locales/{locale}": "app",
  "packages/preload-gmail/locales/{locale}": "preload-gmail",
};

export function catalogFiles(config: LinguiConfigNormalized, locale: string) {
  return config.catalogs.map((catalogConfig) => {
    const template = path.relative(config.rootDir, catalogConfig.path);

    const name = CATALOG_NAMES[template];

    if (!name) {
      throw new Error(`The catalog ${template} has no name in CATALOG_NAMES.`);
    }

    const absolute = `${catalogConfig.path.replace("{locale}", locale)}${po.catalogExtension}`;

    return { name, absolute, relative: path.relative(config.rootDir, absolute) };
  });
}

function translationsOf(json: unknown, catalogNames: string[]) {
  const errors: string[] = [];

  const byCatalog = new Map<string, Translation[]>();

  if (!Array.isArray(json)) {
    return { errors: ["The file must hold a JSON array."], byCatalog };
  }

  for (const [index, item] of json.entries()) {
    const record = item as Record<string, unknown>;

    const valid =
      typeof record === "object" &&
      record !== null &&
      typeof record.catalog === "string" &&
      typeof record.msgid === "string" &&
      typeof record.msgstr === "string" &&
      record.msgstr !== "" &&
      (record.msgctxt === undefined || typeof record.msgctxt === "string");

    if (!valid) {
      errors.push(
        `Item ${index} must be { catalog, msgctxt?, msgid, msgstr }, with a msgstr that isn't empty.`,
      );

      continue;
    }

    const catalog = record.catalog as string;

    if (!catalogNames.includes(catalog)) {
      errors.push(
        `Item ${index} names catalog ${JSON.stringify(catalog)}; use ${catalogNames.join(" or ")}.`,
      );

      continue;
    }

    const { msgctxt, msgid, msgstr } = record as Translation;

    append(byCatalog, catalog, { msgctxt, msgid, msgstr });
  }

  return { errors, byCatalog };
}

async function apply(config: LinguiConfigNormalized, jsonPath: string, locales: string[]) {
  const [locale] = locales;

  if (
    locales.length !== 1 ||
    !locale ||
    locale === config.sourceLocale ||
    !config.locales.includes(locale)
  ) {
    throw new Error(
      `--apply takes one locale, one of ${config.locales.filter((tag) => tag !== config.sourceLocale).join(", ")}.`,
    );
  }

  const files = catalogFiles(config, locale);

  const { errors, byCatalog } = translationsOf(
    await Bun.file(jsonPath).json(),
    files.map(({ name }) => name),
  );

  const writes: { relative: string; absolute: string; text: string; count: number }[] = [];

  for (const { name, absolute, relative } of files) {
    const translations = byCatalog.get(name);

    if (!translations) {
      continue;
    }

    const result = applyTranslations(await Bun.file(absolute).text(), translations);

    errors.push(...result.errors.map((error) => `${name}: ${error}`));

    if (result.text !== undefined) {
      writes.push({ relative, absolute, text: result.text, count: translations.length });
    }
  }

  if (errors.length > 0) {
    console.error(`Wrote nothing, since:\n${errors.map((error) => `- ${error}`).join("\n")}`);

    process.exitCode = 1;

    return;
  }

  for (const { relative, absolute, text, count } of writes) {
    await Bun.write(absolute, text);

    console.log(`Wrote ${count} translations to ${relative}.`);
  }
}

/*
 * Every live entry of a locale side by side with its English, grouped by the
 * file it comes from so a reviewer reads a screen's strings together. An entry
 * used in several files is listed once, under the first, and marked, since its
 * one translation has to fit every place.
 */
export function dumpCatalogs(
  locale: string,
  catalogs: { name: string; relative: string; catalog: Catalog }[],
) {
  const sections = [
    `# ${locale}: every entry, grouped by the file it comes from`,
    'Columns: msgctxt | msgid | msgstr | comments | origins. "-" is no msgctxt. "[multi]" marks an entry used in more than one file, listed under the first.',
  ];

  let total = 0;

  let multiOrigin = 0;

  for (const { name, relative, catalog } of catalogs) {
    const groups = new Map<string, string[]>();

    for (const [id, entry] of Object.entries(catalog)) {
      if (entry.obsolete) {
        continue;
      }

      const origins = [...new Set((entry.origin ?? []).map(([origin]) => origin))];

      const multi = origins.length > 1;

      const columns = [
        entry.context === undefined ? "-" : JSON.stringify(entry.context),
        JSON.stringify(entry.message ?? id),
        `${JSON.stringify(entry.translation ?? "")}${entry.extra?.flags?.includes("fuzzy") ? " (fuzzy)" : ""}`,
        (entry.comments ?? []).join(" / "),
        origins.join(", "),
      ];

      append(
        groups,
        origins[0] ?? "(no origin)",
        `${multi ? "[multi] " : ""}${columns.join(" | ")}`,
      );

      total++;

      if (multi) {
        multiOrigin++;
      }
    }

    sections.push(`## ${name}: ${relative}`);

    for (const [origin, lines] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      sections.push(`### ${origin}\n\n${lines.join("\n")}`);
    }
  }

  return { text: `${sections.join("\n\n")}\n`, total, multiOrigin };
}

async function dump(config: LinguiConfigNormalized, locale: string, out: string | undefined) {
  if (!out || !config.locales.includes(locale)) {
    throw new Error(`--dump takes a locale, one of ${config.locales.join(", ")}, and --out <dir>.`);
  }

  const catalogs = await Promise.all(
    catalogFiles(config, locale).map(async ({ name, absolute, relative }) => ({
      name,
      relative,
      catalog: await parse(await Bun.file(absolute).text(), locale, config.sourceLocale, relative),
    })),
  );

  const { text, total, multiOrigin } = dumpCatalogs(locale, catalogs);

  const dumpPath = path.join(out, `${locale}.dump.txt`);

  await mkdir(out, { recursive: true });

  await Bun.write(dumpPath, text);

  console.log(`${dumpPath}: ${total} entries, ${multiOrigin} used in more than one file`);
}

function formatEntry(id: string, entry: Entry, status: string, priorArt?: PriorArt) {
  return [
    `- msgid: ${JSON.stringify(entry.message ?? id)}`,
    entry.context ? `  msgctxt: ${JSON.stringify(entry.context)}` : undefined,
    ...(entry.comments ?? []).map((comment) => `  comment: ${comment}`),
    ...(entry.origin ?? []).map(([origin]) => `  origin: ${origin}`),
    `  status: ${status}`,
    priorArt
      ? `  prior art (${priorArt.match}): ${JSON.stringify(priorArt.source)} was ${JSON.stringify(priorArt.translation)}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

async function readCatalogAt(ref: string, locale: string, sourceLocale: string, relative: string) {
  const text = readAtRef(ref, relative);

  return text ? await parse(text, locale, sourceLocale, relative) : undefined;
}

export type LocaleCatalog = {
  name: string;
  relative: string;
  /** Undefined when the catalog file is missing. */
  catalog: Catalog | undefined;
  /** The catalog at HEAD and at the merge base, where prior art comes from. */
  earlier: Catalog[];
  /** The catalog at the merge base, or undefined when the base didn't resolve. */
  atBase: Catalog | undefined;
};

export type LocaleList =
  | { kind: "translate" | "review"; sections: string[]; count: number }
  | { kind: "none" | "unknown" };

/*
 * Decided per locale: one with entries to translate gets those, and one with
 * none gets every translation changed since the merge base for review, so a
 * hand edit in one language is reviewed even while another is being
 * translated. Without a merge base, a locale with nothing to translate is
 * `unknown`, never `none`, since what changed can't be told.
 */
export function listLocale(catalogs: LocaleCatalog[], base: string): LocaleList {
  const sections: string[] = [];

  let count = 0;

  for (const { name, relative, catalog, earlier } of catalogs) {
    if (!catalog) {
      sections.push(`### ${name}: ${relative}\n\nMissing; run \`bun run i18n:extract\` first.`);

      continue;
    }

    const live = Object.entries(catalog).filter(([, entry]) => !entry.obsolete);

    const liveSources = new Set(live.map(([id, entry]) => keyOf(id, entry)));

    const candidates = Object.entries(catalog).filter(
      ([, entry]) => entry.obsolete && entry.translation,
    );

    for (const [id, entry] of earlier.flatMap((other) => Object.entries(other))) {
      const key = keyOf(id, entry);

      if (!entry.obsolete && entry.translation && !liveSources.has(key)) {
        liveSources.add(key);
        candidates.push([id, entry]);
      }
    }

    const pending = live.filter(
      ([, entry]) => !entry.translation || entry.extra?.flags?.includes("fuzzy"),
    );

    if (pending.length === 0) {
      continue;
    }

    count += pending.length;

    const priorArtById = assignPriorArt(pending, candidates);

    const lines = pending.map(([id, entry]) =>
      formatEntry(
        id,
        entry,
        entry.translation
          ? `fuzzy, current translation ${JSON.stringify(entry.translation)}`
          : "untranslated",
        priorArtById.get(id),
      ),
    );

    sections.push(`### ${name}: ${relative}\n\n${lines.join("\n")}`);
  }

  if (sections.length > 0) {
    return { kind: "translate", sections, count };
  }

  for (const { name, relative, catalog, atBase } of catalogs) {
    if (!atBase) {
      return { kind: "unknown" };
    }

    const changes = translationChanges(catalog ?? {}, atBase);

    if (changes.length === 0) {
      continue;
    }

    count += changes.length;

    const lines = changes.map(({ id, entry, previous }) =>
      formatEntry(
        id,
        entry,
        `changed since ${base}, current translation ${JSON.stringify(entry.translation)}, ${previous?.translation ? `was ${JSON.stringify(previous.translation)}` : "new"}`,
      ),
    );

    sections.push(`### ${name}: ${relative}\n\n${lines.join("\n")}`);
  }

  return sections.length > 0 ? { kind: "review", sections, count } : { kind: "none" };
}

async function collect(
  config: LinguiConfigNormalized,
  { base = DEFAULT_BASE, out }: { base?: string; out?: string },
  requested: string[],
) {
  const baseCommit = mergeBase(base);

  const refs = [...new Set(["HEAD", baseCommit])].filter((ref): ref is string => Boolean(ref));

  const locales = config.locales.filter(
    (locale) =>
      locale !== config.sourceLocale && (requested.length === 0 || requested.includes(locale)),
  );

  if (locales.length === 0) {
    console.log(`Only ${config.sourceLocale} ships, so there is nothing to translate.`);

    return;
  }

  let glossary: string | undefined;

  let glossaryWarned = false;

  const byKind = { translate: [], review: [], none: [], unknown: [] } as Record<
    LocaleList["kind"],
    string[]
  >;

  for (const locale of locales) {
    const catalogs = await Promise.all(
      catalogFiles(config, locale).map(async ({ name, absolute, relative }) => {
        const file = Bun.file(absolute);

        const read = (ref: string) => readCatalogAt(ref, locale, config.sourceLocale, relative);

        return {
          name,
          relative,
          catalog: (await file.exists())
            ? await parse(await file.text(), locale, config.sourceLocale, relative)
            : undefined,
          earlier: (await Promise.all(refs.map(read))).filter(
            (catalog): catalog is Catalog => catalog !== undefined,
          ),
          atBase: baseCommit ? ((await read(baseCommit)) ?? {}) : undefined,
        };
      }),
    );

    const list = listLocale(catalogs, base);

    byKind[list.kind].push(locale);

    if (!("sections" in list)) {
      continue;
    }

    const section = `## ${locale}\n\n${list.sections.join("\n\n")}\n`;

    if (!out) {
      console.log(section);

      continue;
    }

    const entriesPath = path.join(out, `${locale}.txt`);

    const glossaryPath = path.join(out, `${locale}.glossary.md`);

    glossary ??= await Bun.file(GLOSSARY_PATH).text();

    const slice = sliceGlossary(glossary, locale);

    if (!glossaryWarned) {
      for (const warning of slice.warnings) {
        console.error(`Warning: ${warning}`);
      }

      glossaryWarned = true;
    }

    await mkdir(out, { recursive: true });

    await Bun.write(entriesPath, section);

    await Bun.write(glossaryPath, slice.text);

    console.log(`${locale} (${list.kind}, ${list.count} entries): ${entriesPath} ${glossaryPath}`);
  }

  if (!baseCommit) {
    console.error(
      `${byKind.unknown.length > 0 ? "Error" : "Warning"}: --base ${base} has no merge base with HEAD, so prior art comes from HEAD alone${byKind.unknown.length > 0 ? `, and what changed in ${byKind.unknown.join(", ")} can't be listed for review` : ""}. Fetch it or pass another ref.`,
    );
  }

  const summary = [
    byKind.translate.length > 0 && `To translate: ${byKind.translate.join(", ")}.`,
    byKind.review.length > 0 &&
      `To review only, as a partial run of translations changed since ${base}: ${byKind.review.join(", ")}.`,
    byKind.none.length > 0 && `Nothing to translate or review in ${byKind.none.join(", ")}.`,
  ].filter(Boolean);

  if (summary.length > 0) {
    console.log(summary.join("\n"));
  }

  if (byKind.unknown.length > 0) {
    process.exitCode = 2;
  }
}

async function run() {
  const config = getConfig();

  const { values, positionals } = parseArgs({
    options: {
      base: { type: "string" },
      out: { type: "string" },
      apply: { type: "string" },
      dump: { type: "string" },
    },
    allowPositionals: true,
  });

  if (values.apply) {
    await apply(config, values.apply, positionals);

    return;
  }

  if (values.dump) {
    await dump(config, values.dump, values.out);

    return;
  }

  await collect(config, values, positionals);
}

if (import.meta.main) {
  await run();
}
