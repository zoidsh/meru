import path from "node:path";
import { getConfig } from "@lingui/conf";
import { formatter } from "@lingui/format-po";

/*
 * Lists, per locale, the entries a translator has to write, each with the old
 * translation of the English it replaces when one can be found. A changed
 * English is a new entry, so the old one is only obsolete in the catalog, or
 * gone from it once `extract --clean` has run, which is why the catalog is also
 * read as `HEAD` and as the merge base with `--base` have it.
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

function sameNote(a: Entry, b: Entry) {
  const comments = (a.comments ?? []).join("\n");

  return (
    comments !== "" &&
    (a.context ?? "") === (b.context ?? "") &&
    comments === (b.comments ?? []).join("\n")
  );
}

function findPriorArt(entry: Entry, id: string, candidates: [string, Entry][]) {
  const priorArt = ([candidateId, candidate]: [string, Entry], match: string): PriorArt => ({
    source: candidate.message ?? candidateId,
    translation: candidate.translation ?? "",
    match,
  });

  const byNote = candidates.find(([, candidate]) => sameNote(entry, candidate));

  if (byNote) {
    return priorArt(byNote, "same context and comment");
  }

  const source = entry.message ?? id;

  let best: PriorArt | undefined;

  let bestScore = SIMILARITY_THRESHOLD;

  for (const candidate of candidates) {
    if ((candidate[1].context ?? "") !== (entry.context ?? "")) {
      continue;
    }

    const score = similarity(source, candidate[1].message ?? candidate[0]);

    if (score >= bestScore) {
      bestScore = score;
      best = priorArt(candidate, `similar English (${score.toFixed(2)})`);
    }
  }

  return best;
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

function argumentsOf(argv: string[]) {
  const baseIndex = argv.indexOf("--base");

  const base = baseIndex === -1 ? undefined : argv[baseIndex + 1];

  const locales = argv.filter((_, index) => index !== baseIndex && index !== baseIndex + 1);

  return { base, locales };
}

async function run() {
  const config = getConfig();

  const { base, locales: requested } = argumentsOf(process.argv.slice(2));

  const refs = [...new Set(["HEAD", base && mergeBase(base)])].filter((ref): ref is string =>
    Boolean(ref),
  );

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

        const priorArt = findPriorArt(entry, id, candidates);

        if (priorArt) {
          fields.push(
            `  prior art (${priorArt.match}): ${JSON.stringify(priorArt.source)} was ${JSON.stringify(priorArt.translation)}`,
          );
        }

        return fields.filter(Boolean).join("\n");
      });

      sections.push(`### ${relative}\n\n${lines.join("\n")}`);
    }

    if (sections.length > 0) {
      console.log(`## ${locale}\n\n${sections.join("\n\n")}\n`);
    }
  }

  if (pendingTotal === 0 && missingTotal === 0) {
    console.log(`Nothing to translate in ${locales.join(", ")}.`);
  }
}

await run();
