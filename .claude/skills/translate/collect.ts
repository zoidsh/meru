import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { getConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";
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
 * language rather than every one.
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

type Catalog = Record<string, Entry>;

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

/*
 * Keeps the headings and the English prose of every entry, and of the bullets
 * only the locale's own. Anything else, such as a table, a code block or a list
 * that isn't one line per locale, is dropped with a warning rather than guessed
 * at, so a change to the glossary's shape shows up instead of leaking every
 * language into the slice.
 */
export function sliceGlossary(
  markdown: string,
  locale: string,
  tags: readonly string[] = CATALOG_TAGS,
) {
  const kept: string[] = [];

  const warnings: string[] = [];

  let inFence = false;

  let bullet: "kept" | "dropped" | undefined;

  for (const [index, line] of markdown.split("\n").entries()) {
    const skip = () =>
      warnings.push(`glossary.md:${index + 1}: skipped ${JSON.stringify(line.slice(0, 60))}`);

    if (line.trimStart().startsWith("```")) {
      if (!inFence) {
        skip();
      }

      inFence = !inFence;

      bullet = undefined;

      continue;
    }

    if (inFence) {
      continue;
    }

    const tag = LOCALE_BULLET.exec(line)?.[1];

    const continuesBullet = bullet !== undefined && /^\s+\S/.test(line);

    if (tag && tags.includes(tag)) {
      bullet = tag === locale ? "kept" : "dropped";
    } else if (!continuesBullet) {
      bullet = undefined;

      if (/^\s*(?:[-*+] |\d+[.)] |\|)|^\s+\S/.test(line)) {
        skip();

        continue;
      }
    }

    if (bullet !== "dropped") {
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

async function run() {
  const config = getConfig();

  const { values, positionals: requested } = parseArgs({
    options: { base: { type: "string" }, out: { type: "string" } },
    allowPositionals: true,
  });

  const { base, out } = values;

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

    for (const catalogConfig of config.catalogs) {
      const absolute = `${catalogConfig.path.replace("{locale}", locale)}${po.catalogExtension}`;

      const relative = path.relative(config.rootDir, absolute);

      const file = Bun.file(absolute);

      if (!(await file.exists())) {
        sections.push(`### ${relative}\n\nMissing; run \`bun run i18n:extract\` first.`);

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

      sections.push(`### ${relative}\n\n${lines.join("\n")}`);
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

if (import.meta.main) {
  await run();
}
