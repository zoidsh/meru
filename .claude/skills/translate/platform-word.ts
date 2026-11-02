import path from "node:path";
import { parseArgs } from "node:util";
import {
  type AppleString,
  appleStrings,
  GNOME_PROJECTS,
  type PoEntry,
  parsePoEntries,
  parseTbxEntries,
  readGnomePo,
  sourceCode,
  TAGS,
  type TbxEntry,
  tbxPath,
  unknownTags,
} from "./corpus";
import { renderPlatformTable, writeGeneratedTable } from "./platform-table";
import {
  type Platform,
  type PlatformRow,
  PLATFORMS,
  type Sidecar,
  sidecarPath,
  sidecarSchema,
  styleSheetPath,
  withoutAccessKey,
} from "./rules";

/*
 * Looks a platform word up in the operating systems' own translations, the
 * source order's first step: Apple's AppKit, Mail and WebKit for macOS, the
 * Microsoft Terminology Collection for Windows and GNOME for Linux. Every
 * candidate carries the source id a sidecar row cites, written as the rows
 * write it, so a row is copied from the output rather than searched for.
 */

/** One place a candidate word comes from, as a sidecar's `source` cites it. */
export type CandidateSource = { source: string; english: string; definition?: string };

/** A word one platform's source gives for the English, with every place it does. */
export type Candidate = { word: string; exact: boolean; sources: CandidateSource[] };

export type Candidates = Record<Platform, Candidate[]>;

/** GNOME projects by the name their translations are cited with, `gtk40.pot`'s gtk4. */
const GNOME_CITED: Record<string, string> = { gtk: "gtk4" };

const PLACEHOLDER = /\{[^}]*\}|%(?:\d+\$)?[@sdu]|%@/gu;

/*
 * The English as each source writes it, compared alike: no access key, `&` or
 * GNOME's `_`, any placeholder one `%`, no trailing ellipsis or colon, and
 * case folded, since the TBX writes its terms in lower case.
 */
export function comparable(english: string) {
  return withoutAccessKey(english)
    .replace(/_(?=\S)/gu, "")
    .replace(PLACEHOLDER, "%")
    .replace(/(?:…|\.\.\.)$/u, "")
    .replace(/:$/u, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en");
}

/*
 * A source's translation as a Meru label: GNOME's access key dropped, `_` or
 * Japanese's `(_X)`, three dots made an ellipsis, a placeholder given Meru's
 * name, and the first letter capitalised as Meru's English is, since the TBX
 * writes a term the way it runs in a sentence.
 */
export function asLabel(translation: string, english: string) {
  let word = translation
    .replace(/\(_[^)]\)/gu, "")
    .replace(/_(?=\S)/gu, "")
    .replace(/\.\.\.$/u, "…")
    .trim();

  const meruPlaceholders = english.match(/\{[^}]*\}/gu) ?? [];

  const placeholders = word.match(PLACEHOLDER) ?? [];

  if (meruPlaceholders.length === 1 && placeholders.length === 1) {
    word = word.replace(placeholders[0] as string, meruPlaceholders[0] as string);
  }

  const first = english.replace(/^[^\p{L}]+/u, "")[0];

  if (first !== undefined && first === first.toLocaleUpperCase("en") && /^\p{Ll}/u.test(word)) {
    word = word[0]?.toLocaleUpperCase() + word.slice(1);
  }

  return word;
}

/** A GNOME project's entries, cited by the project's name. */
export type GnomeCatalog = { project: string; entries: PoEntry[] };

export type PlatformData = { apple: AppleString[]; tbx: TbxEntry[]; gnome: GnomeCatalog[] };

type Found = { word: string; english: string } & CandidateSource;

function grouped(english: string, found: Found[]): Candidate[] {
  const byWord = new Map<string, Candidate>();

  const exactEnglish = withoutAccessKey(english).replace(PLACEHOLDER, "%");

  const isExact = (sourceEnglish: string) =>
    sourceEnglish.replace(/_(?=\S)/gu, "").replace(PLACEHOLDER, "%") === exactEnglish;

  // A label's own kind of source first: the English as Meru writes it, then a menu's table.
  const rank = ({ english: sourceEnglish, source }: CandidateSource) =>
    (isExact(sourceEnglish) ? 0 : 2) + (/`[^`]*Menu[^`]*`/u.test(source) ? 0 : 1);

  for (const { word, english: sourceEnglish, ...source } of found) {
    const candidate = byWord.get(word) ?? { word, exact: false, sources: [] };

    candidate.exact ||= isExact(sourceEnglish);

    candidate.sources.push({ ...source, english: sourceEnglish });

    byWord.set(word, candidate);
  }

  for (const candidate of byWord.values()) {
    candidate.sources.sort((a, b) => rank(a) - rank(b));
  }

  // A word whose source writes the English exactly as Meru does comes first, then the most cited.
  return [...byWord.values()].sort(
    (a, b) => Number(b.exact) - Number(a.exact) || b.sources.length - a.sources.length,
  );
}

/** Every word each platform's source gives for the English, best first. */
export function findCandidates(english: string, data: PlatformData): Candidates {
  const wanted = comparable(english);

  // Mail names itself where Meru's message has `{appName}`, as in Quit Mail.
  const appNamed = english.includes("{appName}");

  const apple = data.apple
    .filter(
      (string) =>
        comparable(string.english) === wanted ||
        (appNamed &&
          string.bundle === "Mail" &&
          comparable(string.english.replace(/\bMail\b/u, "{appName}")) === wanted),
    )
    .map(
      (string): Found => ({
        word: asLabel(string.translation, english),
        english: string.english,
        source: `(${string.bundle} \`${string.table}\` \`${string.key}\`)`,
      }),
    );

  const tbx = data.tbx.flatMap((entry) =>
    entry.english
      .filter((term) => comparable(term) === wanted)
      .flatMap((term) =>
        entry.translated.map(
          (translation): Found => ({
            word: asLabel(translation, english),
            english: term,
            source: `(TBX \`${entry.id}\`)`,
            ...(entry.definition === undefined ? {} : { definition: entry.definition }),
          }),
        ),
      ),
  );

  const gnome = data.gnome.flatMap(({ project, entries }) =>
    entries
      .filter((entry) => entry.msgstr !== "" && comparable(entry.msgid) === wanted)
      .map(
        (entry): Found => ({
          word: asLabel(entry.msgstr, english),
          english: entry.msgid,
          source: `(${GNOME_CITED[project] ?? project} ${
            entry.msgctxt === undefined ? "" : `\`${entry.msgctxt}\` `
          }\`${entry.msgid}\`)`,
        }),
      ),
  );

  return {
    macOS: grouped(english, apple),
    Windows: grouped(english, tbx),
    Linux: grouped(english, gnome),
  };
}

/** A tag's three sources, each fetched into the raw cache when it isn't there yet. */
export async function loadPlatformData(
  tag: string,
  warn: (message: string) => void = console.warn,
): Promise<PlatformData> {
  const apple = await appleStrings(tag).catch((error: unknown) => {
    warn(`apple ${tag}: ${error instanceof Error ? error.message : String(error)}`);

    return [];
  });

  const tbx = await tbxPath(tag);

  const code = sourceCode("gnome", tag);

  const gnome: GnomeCatalog[] = [];

  for (const project of code === undefined ? [] : GNOME_PROJECTS) {
    try {
      gnome.push({ project, entries: parsePoEntries(await readGnomePo(project, code as string)) });
    } catch (error) {
      warn(`gnome ${tag}: ${project}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    apple,
    tbx: tbx === undefined ? [] : parseTbxEntries(await Bun.file(tbx).text()),
    gnome,
  };
}

function truncated(text: string, length = 90) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** The candidates as the command prints them, `limit` sources shown under each word. */
export function formatCandidates(tag: string, candidates: Candidates, limit = 3) {
  const lines = [tag];

  for (const platform of PLATFORMS) {
    lines.push(`  ${platform}`);

    if (candidates[platform].length === 0) {
      lines.push("    (none)");
    }

    for (const { word, sources } of candidates[platform]) {
      lines.push(`    ${word}`);

      for (const { source, english, definition } of sources.slice(0, limit)) {
        const quoted = source.includes(`\`${english}\``) ? "" : ` “${english}”`;

        lines.push(
          `      ${source}${quoted}${definition === undefined ? "" : ` ${truncated(definition)}`}`,
        );
      }

      if (sources.length > limit) {
        lines.push(`      and ${sources.length - limit} more`);
      }
    }
  }

  return lines.join("\n");
}

/** What a new row settles, and the choices made for a language where the first candidate won't do. */
export type RowOptions = {
  row: string;
  labels: string[];
  sentences: string[];
  platforms: Platform[];
  /** The cell of a platform the row doesn't cover, such as `macOS only`. */
  note: string;
  /** A word other than the first candidate, by `<tag>:<platform>`. */
  picks: Record<string, string>;
  /** A source for a picked word no candidate gives, such as an inferred one, by `<tag>:<platform>`. */
  cites: Record<string, string>;
};

/*
 * Apple's tables of key names, accessibility descriptions and Touch Bar
 * items, and GNOME's `keyboard label` context, never a label's own sense.
 */
const NON_LABEL_SOURCE =
  /^\((?:(?:AppKit|Mail|WebKit) `[^`]*(?:Key|Accessibility|TouchBar)[^`]*`|\S+ `keyboard label` )/u;

function described({ word, sources }: Candidate) {
  return `${word} ${sources[0]?.source ?? ""}`.trim();
}

/*
 * Why the first candidate can't be taken unasked: another ranks the same,
 * or every place it comes from names something other than a label, such as
 * the Help key.
 */
export function doubtAbout(candidates: Candidate[]): string | undefined {
  const [first, ...rest] = candidates;

  if (first === undefined) {
    return undefined;
  }

  const tied = rest.filter(
    (other) => other.exact === first.exact && other.sources.length === first.sources.length,
  );

  if (tied.length > 0) {
    return `the first candidates tie: ${[first, ...tied].map(described).join("; ")}`;
  }

  if (first.sources.every(({ source }) => NON_LABEL_SOURCE.test(source))) {
    return `${described(first)} names a key or an accessibility label, not a label`;
  }

  return undefined;
}

/** The row a language's sidecar gets, or why it can't be written. */
export function buildRow(
  tag: string,
  candidates: Candidates,
  options: RowOptions,
): { row: PlatformRow } | { errors: string[] } {
  const errors: string[] = [];

  const cells = PLATFORMS.map((platform): PlatformRow[Platform] => {
    if (!options.platforms.includes(platform)) {
      return options.note;
    }

    const key = `${tag}:${platform}`;

    const pick = options.picks[key];

    const doubt = pick === undefined ? doubtAbout(candidates[platform]) : undefined;

    if (doubt !== undefined) {
      errors.push(`${key}: ${doubt}; give --pick ${key}=<word>`);

      return options.note;
    }

    const candidate =
      pick === undefined
        ? candidates[platform][0]
        : candidates[platform].find(({ word }) => word === pick);

    const word = pick ?? candidate?.word;

    const source = options.cites[key] ?? candidate?.sources[0]?.source;

    if (word === undefined || source === undefined) {
      errors.push(
        word === undefined
          ? `${key}: no candidate; give --pick ${key}=<word> and --cite ${key}=<source>`
          : `${key}: no candidate is ${word}; give --cite ${key}=<source>`,
      );

      return options.note;
    }

    return [
      {
        word,
        source,
        ...(options.labels.length > 0 ? { labels: options.labels } : {}),
        ...(options.sentences.length > 0 ? { sentences: options.sentences } : {}),
      },
    ];
  });

  if (errors.length > 0) {
    return { errors };
  }

  const [macOS, Windows, Linux] = cells as [
    PlatformRow["macOS"],
    PlatformRow["Windows"],
    PlatformRow["Linux"],
  ];

  return { row: { row: options.row, macOS, Windows, Linux } };
}

/** The sidecar with the row after its last, or undefined when it already has a row of that name. */
export function withRow(sidecar: Sidecar, row: PlatformRow): Sidecar | undefined {
  if (sidecar.platformWords.rows.some(({ row: name }) => name === row.row)) {
    return undefined;
  }

  return {
    ...sidecar,
    platformWords: { ...sidecar.platformWords, rows: [...sidecar.platformWords.rows, row] },
  };
}

/** `<tag>:<platform>=<value>` options as a record, throwing on one that isn't. */
function byCell(values: string[] | undefined, option: string) {
  const record: Record<string, string> = {};

  for (const value of values ?? []) {
    const match = /^([^:=]+):(macOS|Windows|Linux)=(.+)$/su.exec(value);

    if (!match) {
      throw new Error(`--${option} ${value}: write it as <tag>:<platform>=<value>`);
    }

    record[`${match[1]}:${match[2]}`] = match[3] as string;
  }

  return record;
}

/*
 * Writes the row into every sidecar, and each style sheet's table from it, or
 * nothing at all when any language lacks a word, since the sidecar test needs
 * every filled sidecar to cover every platform entry.
 */
async function addRow(english: string, tags: string[], options: RowOptions) {
  const rows: { tag: string; sidecar: Sidecar }[] = [];

  const errors: string[] = [];

  for (const tag of tags) {
    const built = buildRow(
      tag,
      findCandidates(english, await loadPlatformData(tag, console.error)),
      options,
    );

    if ("errors" in built) {
      errors.push(...built.errors);

      continue;
    }

    const raw: Sidecar = await Bun.file(sidecarPath(tag)).json();

    sidecarSchema.parse(raw);

    // The file as written, not as the schema parses it, which would reorder every rule's keys.
    const sidecar = withRow(raw, built.row);

    if (sidecar === undefined) {
      errors.push(`${tag}: ${tag}.json already has a row named ${options.row}`);

      continue;
    }

    rows.push({ tag, sidecar });

    console.log(
      `${tag}: ${PLATFORMS.map((platform) => {
        const cell = built.row[platform];

        return `${platform} ${typeof cell === "string" ? `(${cell})` : cell.map(({ word, source }) => `${word} ${source}`).join("; ")}`;
      }).join(" | ")}`,
    );
  }

  if (errors.length > 0) {
    console.error(`Wrote nothing:\n${errors.map((error) => `  ${error}`).join("\n")}`);

    process.exit(1);
  }

  const written: string[] = [];

  for (const { tag, sidecar } of rows) {
    await Bun.write(sidecarPath(tag), `${JSON.stringify(sidecar, null, 2)}\n`);

    const styleSheet = styleSheetPath(tag);

    await Bun.write(
      styleSheet,
      writeGeneratedTable(await Bun.file(styleSheet).text(), tag, renderPlatformTable(sidecar)),
    );

    written.push(sidecarPath(tag), styleSheet);
  }

  const { exitCode } = Bun.spawnSync(["bunx", "oxfmt", ...written], {
    cwd: path.join(import.meta.dir, "../../.."),
    stdout: "ignore",
    stderr: "inherit",
  });

  process.exit(exitCode);
}

const USAGE = `Usage: bun .claude/skills/translate/platform-word.ts <English> [--tag <tag>]… [--limit <n>] [--json]
       bun .claude/skills/translate/platform-word.ts <English> --add-row <row> [--label <msgid>]… [--sentence <msgid>]… [--platform <platform>]… [--note <text>] [--pick <tag>:<platform>=<word>]… [--cite <tag>:<platform>=<source>]… [--tag <tag>]…

Prints, per language, every word the operating systems' own translations give
for the English: macOS from Apple's AppKit, Mail and WebKit, Windows from the
Microsoft Terminology Collection, Linux from GNOME's ${GNOME_PROJECTS.join(", ")}.
Each word is listed with the source ids a sidecar row cites, best first: a
source that writes the English exactly as Meru does, then the most cited. The
English is matched without its access key, ellipsis or case, and a placeholder
matches any other. Without --tag it covers every tag with a sidecar. A source
missing from .cache/translate/raw is fetched there first, Apple's from this
Mac, which only macOS can do. --limit caps the sources shown under a word
(default 3); --json prints every one.

--add-row writes a Platform words row of that name into every sidecar, shipped
or not, since the sidecar test holds each filled one to every platform entry,
and rewrites each style sheet's table from it. Each covered platform's cell is
its first candidate, citing that word's first source, and settles the --label
msgids, the English when none is given, and the --sentence ones. --platform
names the platforms the row covers, all three by default; the others get
--note, "<platforms> only" by default. --pick takes another word for one
language's platform, and --cite gives the source of a picked word no candidate
lists, such as an inferred one. A cell needs --pick when its first candidates
tie, ranking the same, or its first comes only from Apple's key names,
accessibility descriptions or Touch Bar items, or from GNOME's keyboard
label context; it prints the tied words. It
writes nothing when any cell has no word, needs a pick, or a sidecar already
has the row, and exits 1 listing each.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      tag: { type: "string", multiple: true },
      limit: { type: "string" },
      json: { type: "boolean" },
      "add-row": { type: "string" },
      label: { type: "string", multiple: true },
      sentence: { type: "string", multiple: true },
      platform: { type: "string", multiple: true },
      note: { type: "string" },
      pick: { type: "string", multiple: true },
      cite: { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length !== 1) {
    console.log(USAGE);

    process.exit(values.help ? 0 : 2);
  }

  const english = positionals[0] as string;

  const tags = values.tag ?? TAGS;

  const strangers = unknownTags(tags);

  if (strangers.length > 0) {
    console.error(`Unknown tag ${strangers.join(", ")}; use ${TAGS.join(", ")}.`);

    process.exit(2);
  }

  if (values["add-row"] !== undefined) {
    const platforms = (values.platform ?? PLATFORMS) as Platform[];

    const unknown = platforms.filter((platform) => !PLATFORMS.includes(platform));

    if (unknown.length > 0) {
      console.error(`Unknown platform ${unknown.join(", ")}; use ${PLATFORMS.join(", ")}.`);

      process.exit(2);
    }

    const sentences = values.sentence ?? [];

    await addRow(english, tags, {
      row: values["add-row"],
      labels: values.label ?? (sentences.length > 0 ? [] : [english]),
      sentences,
      platforms,
      note: values.note ?? `${platforms.join(" and ")} only`,
      picks: byCell(values.pick, "pick"),
      cites: byCell(values.cite, "cite"),
    });
  }

  const limit = values.limit === undefined ? 3 : Number(values.limit);

  const results: Record<string, Candidates> = {};

  for (const tag of tags) {
    results[tag] = findCandidates(english, await loadPlatformData(tag, console.error));

    if (!values.json) {
      console.log(`${formatCandidates(tag, results[tag], limit)}\n`);
    }
  }

  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`platform-word.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
