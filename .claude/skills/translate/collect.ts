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
 * read as `HEAD` and as the merge base with `--base` have it.
 *
 * With `--out <dir>`, each locale's list goes to `<dir>/<tag>.txt` instead,
 * with that locale's slice of the glossary beside it, so an agent reads one
 * language rather than every one. `<tag> --apply <json>` writes translations
 * into a locale's catalogs, and `--dump <tag> --out <dir>` writes its whole
 * catalog for review. `--blind <tag> --out <dir>` writes a locale's
 * translations without their English for back-translation, and `--pair <tag>
 * --out <dir>` puts the back-translations beside the English for the judge.
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

async function parse(text: string, locale: string, sourceLocale: string, filename: string) {
  return (await po.parse(text, { locale, sourceLocale, filename })) as Catalog;
}

function readAtRef(ref: string, file: string) {
  const result = Bun.spawnSync(["git", "show", `${ref}:${file}`], { stderr: "ignore" });

  return result.success ? result.stdout.toString() : undefined;
}

function mergeBase(ref: string) {
  const result = Bun.spawnSync(["git", "merge-base", "HEAD", ref], { stderr: "ignore" });

  return result.success ? result.stdout.toString().trim() : undefined;
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

function catalogFiles(config: LinguiConfigNormalized, locale: string) {
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

  const { text, total, multiOrigin } = dumpCatalogs(locale, await readCatalogs(config, locale));

  const dumpPath = path.join(out, `${locale}.dump.txt`);

  await mkdir(out, { recursive: true });

  await Bun.write(dumpPath, text);

  console.log(`${dumpPath}: ${total} entries, ${multiOrigin} used in more than one file`);
}

export type BlindSource = {
  catalog: string;
  msgctxt?: string;
  msgid: string;
  comments: string[];
};

/*
 * A back-translator that sees the English, its comment or even its origin
 * file can write the English back rather than what the translation says, so
 * the blind list holds only an opaque key and the msgstr. What the key stands
 * for goes to a separate file that only the pairing step reads.
 */
export function blindCatalogs(catalogs: { name: string; catalog: Catalog }[]) {
  const blind: { key: string; msgstr: string }[] = [];

  const sources: Record<string, BlindSource> = {};

  for (const { name, catalog } of catalogs) {
    for (const [id, entry] of Object.entries(catalog)) {
      if (entry.obsolete || !entry.translation) {
        continue;
      }

      const key = `e${blind.length + 1}`;

      blind.push({ key, msgstr: entry.translation });

      sources[key] = {
        catalog: name,
        ...(entry.context === undefined ? {} : { msgctxt: entry.context }),
        msgid: entry.message ?? id,
        comments: entry.comments ?? [],
      };
    }
  }

  return { blind, sources };
}

export function pairBackTranslations(
  sources: Record<string, BlindSource>,
  backTranslations: Record<string, string>,
) {
  const missing = Object.keys(sources).filter((key) => !(key in backTranslations));

  const unknown = Object.keys(backTranslations).filter((key) => !(key in sources));

  const lines = Object.entries(sources)
    .filter(([key]) => key in backTranslations)
    .map(([key, { msgctxt, msgid, comments }]) =>
      [
        key,
        msgctxt === undefined ? "-" : JSON.stringify(msgctxt),
        JSON.stringify(msgid),
        JSON.stringify(backTranslations[key]),
        comments.join(" / "),
      ].join(" | "),
    );

  return {
    text: `${[
      'Columns: key | msgctxt | English source | back-translation | comments. "-" is no msgctxt.',
      ...lines,
    ].join("\n")}\n`,
    missing,
    unknown,
  };
}

async function readCatalogs(config: LinguiConfigNormalized, locale: string) {
  return Promise.all(
    catalogFiles(config, locale).map(async ({ name, absolute, relative }) => ({
      name,
      relative,
      catalog: await parse(await Bun.file(absolute).text(), locale, config.sourceLocale, relative),
    })),
  );
}

function checkLocale(config: LinguiConfigNormalized, option: string, locale: string, out?: string) {
  const tags = config.locales.filter((tag) => tag !== config.sourceLocale);

  if (!out || !tags.includes(locale)) {
    throw new Error(`--${option} takes a locale, one of ${tags.join(", ")}, and --out <dir>.`);
  }

  return out;
}

async function blind(config: LinguiConfigNormalized, locale: string, out: string | undefined) {
  const dir = checkLocale(config, "blind", locale, out);

  const { blind: entries, sources } = blindCatalogs(await readCatalogs(config, locale));

  const blindPath = path.join(dir, `${locale}.blind.json`);

  const sourcesPath = path.join(dir, `${locale}.blind-sources.json`);

  await mkdir(dir, { recursive: true });

  await Bun.write(blindPath, `${JSON.stringify(entries, null, 2)}\n`);

  await Bun.write(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`);

  console.log(`${blindPath}: ${entries.length} entries; their sources in ${sourcesPath}`);
}

async function pair(config: LinguiConfigNormalized, locale: string, out: string | undefined) {
  const dir = checkLocale(config, "pair", locale, out);

  const sources = (await Bun.file(path.join(dir, `${locale}.blind-sources.json`)).json()) as Record<
    string,
    BlindSource
  >;

  const backTranslations: Record<string, string> = {};

  for await (const file of new Bun.Glob(`${locale}.back.*.json`).scan(dir)) {
    if (/^\.back\.\d+\.json$/.test(file.slice(locale.length))) {
      Object.assign(backTranslations, await Bun.file(path.join(dir, file)).json());
    }
  }

  const { text, missing, unknown } = pairBackTranslations(sources, backTranslations);

  const pairsPath = path.join(dir, `${locale}.pairs.txt`);

  await Bun.write(pairsPath, text);

  console.log(
    `${pairsPath}: ${Object.keys(sources).length - missing.length} of ${Object.keys(sources).length} entries paired`,
  );

  if (missing.length > 0 || unknown.length > 0) {
    console.error(
      [
        missing.length > 0 ? `No back-translation for ${missing.join(", ")}.` : "",
        unknown.length > 0 ? `Back-translations for unknown keys ${unknown.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    process.exitCode = 1;
  }
}

async function collect(
  config: LinguiConfigNormalized,
  { base, out }: { base?: string; out?: string },
  requested: string[],
) {
  const baseCommit = base ? mergeBase(base) : undefined;

  if (base && !baseCommit) {
    console.error(
      `Warning: --base ${base} has no merge base with HEAD, so prior art comes from HEAD alone. Fetch it or pass another ref.`,
    );
  }

  const refs = [...new Set(["HEAD", baseCommit])].filter((ref): ref is string => Boolean(ref));

  const locales = config.locales.filter(
    (locale) =>
      locale !== config.sourceLocale && (requested.length === 0 || requested.includes(locale)),
  );

  if (locales.length === 0) {
    console.log(`Only ${config.sourceLocale} ships, so there is nothing to translate.`);

    return;
  }

  let pendingTotal = 0;

  let missingTotal = 0;

  let glossary: string | undefined;

  let glossaryWarned = false;

  for (const locale of locales) {
    const sections: string[] = [];

    for (const { name, absolute, relative } of catalogFiles(config, locale)) {
      const file = Bun.file(absolute);

      if (!(await file.exists())) {
        sections.push(`### ${name}: ${relative}\n\nMissing; run \`bun run i18n:extract\` first.`);

        missingTotal++;

        continue;
      }

      const catalog = await parse(await file.text(), locale, config.sourceLocale, relative);

      const live = Object.entries(catalog).filter(([, entry]) => !entry.obsolete);

      const liveSources = new Set(live.map(([id, entry]) => keyOf(id, entry)));

      const candidates = Object.entries(catalog).filter(
        ([, entry]) => entry.obsolete && entry.translation,
      );

      for (const ref of refs) {
        const text = readAtRef(ref, relative);

        if (!text) {
          continue;
        }

        const earlier = await parse(text, locale, config.sourceLocale, relative);

        for (const [id, entry] of Object.entries(earlier)) {
          const key = keyOf(id, entry);

          if (!entry.obsolete && entry.translation && !liveSources.has(key)) {
            liveSources.add(key);
            candidates.push([id, entry]);
          }
        }
      }

      const pending = live.filter(
        ([, entry]) => !entry.translation || entry.extra?.flags?.includes("fuzzy"),
      );

      if (pending.length === 0) {
        continue;
      }

      pendingTotal += pending.length;

      const priorArtById = assignPriorArt(pending, candidates);

      const lines = pending.map(([id, entry]) => {
        const status = entry.translation
          ? `fuzzy, current translation ${JSON.stringify(entry.translation)}`
          : "untranslated";

        const fields = [
          `- msgid: ${JSON.stringify(entry.message ?? id)}`,
          entry.context ? `  msgctxt: ${JSON.stringify(entry.context)}` : undefined,
          ...(entry.comments ?? []).map((comment) => `  comment: ${comment}`),
          ...(entry.origin ?? []).map(([origin]) => `  origin: ${origin}`),
          `  status: ${status}`,
        ];

        const priorArt = priorArtById.get(id);

        if (priorArt) {
          fields.push(
            `  prior art (${priorArt.match}): ${JSON.stringify(priorArt.source)} was ${JSON.stringify(priorArt.translation)}`,
          );
        }

        return fields.filter(Boolean).join("\n");
      });

      sections.push(`### ${name}: ${relative}\n\n${lines.join("\n")}`);
    }

    if (sections.length === 0) {
      continue;
    }

    const section = `## ${locale}\n\n${sections.join("\n\n")}\n`;

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

    console.log(`${locale}: ${entriesPath} ${glossaryPath}`);
  }

  if (pendingTotal === 0 && missingTotal === 0) {
    console.log(`Nothing to translate in ${locales.join(", ")}.`);
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
      blind: { type: "string" },
      pair: { type: "string" },
    },
    allowPositionals: true,
  });

  if (values.blind) {
    await blind(config, values.blind, values.out);

    return;
  }

  if (values.pair) {
    await pair(config, values.pair, values.out);

    return;
  }

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
