import { readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { getConfig } from "@lingui/conf";
import { visibleText } from "./check";
import {
  type AssessedEntry,
  type Catalog,
  catalogFiles,
  changedEntries,
  DEFAULT_BASE,
  mergeBase,
  parse,
  readAtRef,
} from "./collect";

export { type AssessedEntry, changedEntries };

/*
 * Scores a locale's MQM review, the findings of each independent run, so no
 * agent does the arithmetic. Each error costs its severity's points and the
 * score, 100 × (1 − points / source words), is reported, never gated on. The
 * gate blocks on every critical or major error any run reports until the
 * orchestrator dismisses it, with its reason, or it is applied, the catalog no
 * longer holding the translation the runs assessed.
 */

export const SEVERITIES = ["critical", "major", "minor"] as const;

export type MqmSeverity = (typeof SEVERITIES)[number];

export const PENALTY: Record<MqmSeverity, number> = { critical: 25, major: 5, minor: 1 };

export const CATEGORIES = [
  "accuracy/mistranslation",
  "accuracy/omission",
  "accuracy/addition",
  "accuracy/untranslated",
  "fluency/grammar",
  "fluency/spelling",
  "fluency/punctuation",
  "fluency/unidiomatic",
  "terminology",
  "style",
  "locale-conventions",
] as const;

export type MqmFinding = {
  catalog: string;
  msgctxt: string | null;
  msgid: string;
  msgstr: string;
  category: (typeof CATEGORIES)[number];
  severity: MqmSeverity;
  reason: string;
  correction: string;
  source?: string;
  unsure?: boolean;
  /** Written by the skill's orchestrator, never the reviewer: why the finding doesn't stand. */
  dismissed?: string;
};

export type MqmResult = {
  locale: string;
  partial: boolean;
  entries: number;
  words: number;
  counts: Record<MqmSeverity, number>;
  penalty: number;
  score: number;
  perThousand: number;
  passes: boolean;
  findings: MqmFinding[];
  dismissed: MqmFinding[];
  warnings: string[];
};

/*
 * The English's whitespace tokens as a reader sees them. A plural or select's
 * argument, keyword and branch selectors (`one`, `other`, `=0`) are syntax, not
 * words, but every branch's text counts, since each is translated and can hold
 * its own error; a placeholder and a plural's `#` count as one word each, being
 * a value the reader sees; Lingui's `<0>` tags count for nothing.
 */
export function countWords(msgid: string) {
  return visibleText(msgid)
    .replaceAll(/<\/?\d+\/?>/gu, " ")
    .split(/\s+/u)
    .filter(Boolean).length;
}

export function keyOf({ catalog, msgctxt, msgid }: AssessedEntry) {
  return `${catalog}\u0004${msgctxt ?? ""}\u0004${msgid}`;
}

export function describe({ catalog, msgctxt, msgid }: AssessedEntry) {
  return `${catalog}: ${msgctxt === null ? "" : `${JSON.stringify(msgctxt)} `}${JSON.stringify(msgid)}`;
}

/** The entries `collect.ts` listed for translation, read back from its `<tag>.txt`. */
export function parseEntryFile(text: string) {
  const entries: AssessedEntry[] = [];

  let catalog: string | undefined;

  for (const line of text.split("\n")) {
    const heading = /^### ([^:\s]+): /u.exec(line);

    if (heading) {
      catalog = heading[1];

      continue;
    }

    if (line.startsWith("- msgid: ")) {
      if (!catalog) {
        throw new Error(`An entry comes before any "### <catalog>:" heading: ${line}`);
      }

      entries.push({ catalog, msgctxt: null, msgid: JSON.parse(line.slice("- msgid: ".length)) });

      continue;
    }

    const last = entries.at(-1);

    if (last && line.startsWith("  msgctxt: ")) {
      last.msgctxt = JSON.parse(line.slice("  msgctxt: ".length));
    }
  }

  return entries;
}

/*
 * An unresolved `--base` is an error rather than a fallback to HEAD, which would
 * drop the branch's committed changes from the list and shrink the gate unseen.
 */
export function resolveBase(base: string = DEFAULT_BASE, resolve = mergeBase) {
  const ref = resolve(base);

  if (!ref) {
    throw new Error(`--base ${base} has no merge base with HEAD; fetch it or pass another ref.`);
  }

  return ref;
}

/*
 * A correction is scored like any other translation, and the translator's
 * corrections can reach past the entries the findings named, such as a fix
 * `check.ts` asked for after a new pin.
 */
export function correctedEntries(
  catalogs: { name: string; catalog: Catalog }[],
  assessed: Map<string, string>,
) {
  return [...liveEntries(catalogs).entries()].flatMap(([key, { msgstr, ...entry }]) => {
    const read = assessed.get(key);

    return read !== undefined && read !== msgstr ? [entry] : [];
  });
}

export function uniqueEntries(entries: AssessedEntry[]) {
  return [...new Map(entries.map((entry) => [keyOf(entry), entry])).values()];
}

/** The entry file's format, so `parseEntryFile` reads the list back. */
export function formatEntryList(locale: string, entries: AssessedEntry[]) {
  const sections = [`## ${locale}`];

  for (const catalog of new Set(entries.map((entry) => entry.catalog))) {
    const lines = entries
      .filter((entry) => entry.catalog === catalog)
      .map(({ msgctxt, msgid }) =>
        [
          `- msgid: ${JSON.stringify(msgid)}`,
          ...(msgctxt === null ? [] : [`  msgctxt: ${JSON.stringify(msgctxt)}`]),
        ].join("\n"),
      );

    sections.push(`### ${catalog}: entries to assess\n\n${lines.join("\n")}`);
  }

  return `${sections.join("\n\n")}\n`;
}

function validateFinding(item: unknown, index: number) {
  const record = item as Record<string, unknown>;

  const problems: string[] = [];

  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return [`Item ${index} must be an object.`];
  }

  for (const field of ["catalog", "msgid", "msgstr", "reason", "correction"]) {
    if (typeof record[field] !== "string") {
      problems.push(`Item ${index} needs a string ${field}.`);
    }
  }

  if (record.msgctxt !== null && typeof record.msgctxt !== "string") {
    problems.push(`Item ${index} needs msgctxt as a string, or null for none.`);
  }

  if (!SEVERITIES.includes(record.severity as MqmSeverity)) {
    problems.push(
      `Item ${index} has severity ${JSON.stringify(record.severity)}; use ${SEVERITIES.join(", ")}.`,
    );
  }

  if (!CATEGORIES.includes(record.category as MqmFinding["category"])) {
    problems.push(
      `Item ${index} has category ${JSON.stringify(record.category)}; use ${CATEGORIES.join(", ")}.`,
    );
  }

  if (record.source !== undefined && typeof record.source !== "string") {
    problems.push(`Item ${index} has a source that isn't a string.`);
  }

  if (record.unsure !== undefined && typeof record.unsure !== "boolean") {
    problems.push(`Item ${index} has an unsure that isn't a boolean.`);
  }

  if (
    record.dismissed !== undefined &&
    (typeof record.dismissed !== "string" || record.dismissed.trim() === "")
  ) {
    problems.push(`Item ${index} is dismissed without a reason.`);
  }

  return problems;
}

/*
 * Every finding must name an assessed entry: one outside the set would
 * otherwise vanish from the score, and a mistyped msgid is how that happens.
 */
export function liveEntries(catalogs: { name: string; catalog: Catalog }[]) {
  const live = new Map<string, AssessedEntry & { msgstr: string }>();

  for (const { name, catalog } of catalogs) {
    for (const [id, entry] of Object.entries(catalog)) {
      if (!entry.obsolete) {
        const assessed = {
          catalog: name,
          msgctxt: entry.context ?? null,
          msgid: entry.message ?? id,
        };

        live.set(keyOf(assessed), { ...assessed, msgstr: entry.translation ?? "" });
      }
    }
  }

  return live;
}

const JSON_STRING = String.raw`"(?:[^"\\]|\\.)*"`;

const DUMP_ENTRY = new RegExp(
  String.raw`^(?:\[multi\] )?(-|${JSON_STRING}) \| (${JSON_STRING}) \| (${JSON_STRING})`,
  "u",
);

/*
 * The dump is what the reviewers read, so its msgstr, not the catalog's, is
 * the translation a round assessed; a catalog that differs from it has had a
 * correction since.
 */
export function parseDump(text: string) {
  const assessed = new Map<string, string>();

  let catalog: string | undefined;

  for (const line of text.split("\n")) {
    const heading = /^## ([^:\s]+): /u.exec(line);

    if (heading) {
      catalog = heading[1];

      continue;
    }

    const entry = catalog === undefined ? null : DUMP_ENTRY.exec(line);

    if (catalog !== undefined && entry) {
      const [, msgctxt = "-", msgid = '""', msgstr = '""'] = entry;

      assessed.set(
        keyOf({
          catalog,
          msgctxt: msgctxt === "-" ? null : JSON.parse(msgctxt),
          msgid: JSON.parse(msgid),
        }),
        JSON.parse(msgstr),
      );
    }
  }

  return assessed;
}

export function scoreLocale({
  locale,
  catalogs,
  findings,
  entries,
  assessed,
}: {
  locale: string;
  catalogs: { name: string; catalog: Catalog }[];
  findings: unknown;
  /** The entries a partial run assessed; without them, every live entry is. */
  entries?: AssessedEntry[];
  /** Each entry's msgstr as the runs read it, from `parseDump`; without it, the catalog's. */
  assessed?: Map<string, string>;
}): { result?: MqmResult; errors: string[] } {
  const live = liveEntries(catalogs);

  const errors: string[] = [];

  let inScope = [...live.values()];

  if (entries) {
    inScope = [];

    for (const entry of entries) {
      const found = live.get(keyOf(entry));

      if (found) {
        inScope.push(found);
      } else {
        errors.push(`The entry file lists ${describe(entry)}, which no catalog holds.`);
      }
    }
  }

  if (!Array.isArray(findings)) {
    return { errors: [...errors, "The findings file must hold a JSON array."] };
  }

  errors.push(...findings.flatMap(validateFinding));

  if (errors.length > 0) {
    return { errors };
  }

  const assessedByKey = new Map(inScope.map((entry) => [keyOf(entry), entry]));

  const warnings: string[] = [];

  for (const finding of findings as MqmFinding[]) {
    const entry = assessedByKey.get(keyOf(finding));

    const read = assessed?.get(keyOf(finding)) ?? entry?.msgstr;

    if (!entry) {
      errors.push(`A finding names ${describe(finding)}, which this run didn't assess.`);
    } else if (read !== finding.msgstr) {
      warnings.push(
        `A finding on ${describe(finding)} quotes ${JSON.stringify(finding.msgstr)}, but the run assessed ${JSON.stringify(read)}.`,
      );
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const scored = (findings as MqmFinding[]).filter(({ dismissed }) => dismissed === undefined);

  const dismissed = (findings as MqmFinding[]).filter(({ dismissed }) => dismissed !== undefined);

  const words = inScope.reduce((total, { msgid }) => total + countWords(msgid), 0);

  const counts = countSeverities(scored);

  const scoring = scoreOf(penaltyOf(counts), words);

  const partial = entries !== undefined;

  return {
    result: {
      locale,
      partial,
      entries: inScope.length,
      words,
      counts,
      ...scoring,
      passes: passesGate(counts),
      findings: scored,
      dismissed,
      warnings,
    },
    errors,
  };
}

function countSeverities(findings: { severity: MqmSeverity }[]) {
  const counts: Record<MqmSeverity, number> = { critical: 0, major: 0, minor: 0 };

  for (const { severity } of findings) {
    counts[severity]++;
  }

  return counts;
}

function penaltyOf(counts: Record<MqmSeverity, number>) {
  return SEVERITIES.reduce((total, severity) => total + counts[severity] * PENALTY[severity], 0);
}

function scoreOf(penalty: number, words: number) {
  const ratio = words === 0 ? 0 : penalty / words;

  return { penalty, score: 100 * (1 - ratio), perThousand: 1000 * ratio };
}

function passesGate(counts: Record<MqmSeverity, number>) {
  return counts.critical === 0 && counts.major === 0;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export const RANK: Record<MqmSeverity, number> = { minor: 1, major: 2, critical: 3 };

export type RunFinding = MqmFinding & { run: string };

/** An entry's findings across the runs, at the most severe any run reports. */
export type EntryFinding = MqmFinding & {
  /** How many runs report the entry at this severity, not how many agree on one error. */
  runsAtSeverity: number;
  runs: number;
  /** The catalog no longer holds the translation the runs assessed. */
  applied: boolean;
  /** Every run's finding on the entry, the most severe first. */
  all: RunFinding[];
};

export function blocks(finding: EntryFinding) {
  return RANK[finding.severity] >= RANK.major && !finding.applied;
}

/*
 * Every finding any run reports counts: measured on the regression sets, a
 * vote between runs dropped real catches and never a false positive, so the
 * orchestrator rules on each critical or major one instead. Runs are matched
 * by entry, not by category, since two runs often file one error under
 * different categories.
 */
export function mergeRuns(
  runs: { name: string; findings: MqmFinding[] }[],
  isApplied: (entry: AssessedEntry) => boolean = () => false,
) {
  const byEntry = new Map<string, RunFinding[]>();

  for (const { name, findings } of runs) {
    for (const finding of findings) {
      byEntry.set(keyOf(finding), [
        ...(byEntry.get(keyOf(finding)) ?? []),
        { ...finding, run: name },
      ]);
    }
  }

  return [...byEntry.values()].map((all): EntryFinding => {
    const sorted = [...all].sort((a, b) => RANK[b.severity] - RANK[a.severity]);

    const [{ run: _run, ...top }] = sorted as [RunFinding, ...RunFinding[]];

    return {
      ...top,
      runsAtSeverity: new Set(
        sorted.filter(({ severity }) => severity === top.severity).map(({ run }) => run),
      ).size,
      runs: runs.length,
      applied: isApplied(top),
      all: sorted,
    };
  });
}

export type RunScore = {
  name: string;
  counts: Record<MqmSeverity, number>;
  penalty: number;
  score: number;
};

export type MqmRunsResult = Omit<MqmResult, "findings" | "dismissed"> & {
  findings: EntryFinding[];
  dismissed: RunFinding[];
  runs: RunScore[];
};

/*
 * Scores each run on its own and reports the median run's score, so one
 * lenient or harsh run moves it least. A dismissal is the orchestrator's
 * ruling on one finding and removes that finding alone: another run's finding
 * on the same entry can name a different error, and every critical or major
 * has to be ruled on by itself. One run alone scores as `scoreLocale` does.
 */
export function scoreRuns({
  locale,
  catalogs,
  runs,
  entries,
  assessed,
}: {
  locale: string;
  catalogs: { name: string; catalog: Catalog }[];
  runs: { name: string; findings: unknown }[];
  entries?: AssessedEntry[];
  /** Each entry's msgstr as the runs read it, from `parseDump`; without it, nothing counts as applied. */
  assessed?: Map<string, string>;
}): { result?: MqmRunsResult; errors: string[] } {
  const scored = runs.map(({ name, findings }) => ({
    name,
    ...scoreLocale({ locale, catalogs, findings, entries, assessed }),
  }));

  const errors = scored.flatMap(({ name, errors }) => errors.map((error) => `${name}: ${error}`));

  const results = scored.flatMap(({ name, result }) => (result ? [{ name, result }] : []));

  const [first] = results;

  if (errors.length > 0 || !first) {
    return { errors: errors.length > 0 ? errors : ["No findings file to score."] };
  }

  const live = results.map(({ name, result }) => ({ name, findings: result.findings }));

  const { words } = first.result;

  const runScores = live.map(({ name, findings }) => {
    const counts = countSeverities(findings);

    return { name, counts, ...scoreOf(penaltyOf(counts), words) };
  });

  const current = liveEntries(catalogs);

  const findings = mergeRuns(live, (entry) => {
    const read = assessed?.get(keyOf(entry));

    return read !== undefined && read !== current.get(keyOf(entry))?.msgstr;
  });

  return {
    result: {
      ...first.result,
      counts: countSeverities(findings),
      ...scoreOf(median(runScores.map(({ penalty }) => penalty)), words),
      passes: !findings.some(blocks),
      findings,
      dismissed: results.flatMap(({ name, result }) =>
        result.dismissed.map((finding) => ({ ...finding, run: name })),
      ),
      runs: runScores,
      warnings: results.flatMap(({ name, result }) =>
        result.warnings.map((warning) => `${name}: ${warning}`),
      ),
    },
    errors,
  };
}

export function formatTable(results: MqmRunsResult[]) {
  const rows = [
    [
      "Locale",
      "Scope",
      "Entries",
      "Words",
      "Critical",
      "Major",
      "Minor",
      "Dismissed",
      "Points",
      "Median score",
      "Per 1,000 words",
      "Run scores",
      "Gate",
    ],
    [
      "---",
      "---",
      "---:",
      "---:",
      "---:",
      "---:",
      "---:",
      "---:",
      "---:",
      "---:",
      "---:",
      "---:",
      "---",
    ],
    ...results.map((result) => [
      result.locale,
      result.partial ? "partial" : "full",
      String(result.entries),
      String(result.words),
      String(result.counts.critical),
      String(result.counts.major),
      String(result.counts.minor),
      String(result.dismissed.length),
      String(result.penalty),
      result.score.toFixed(2),
      result.perThousand.toFixed(1),
      result.runs.map(({ score }) => score.toFixed(2)).join(" / "),
      result.passes ? "pass" : `BLOCKED, ${result.findings.filter(blocks).length} open`,
    ]),
  ];

  return rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

function formatFinding(
  finding: MqmFinding & { runsAtSeverity?: number; runs?: number; run?: string },
) {
  const tally =
    finding.runs && finding.runs > 1
      ? ` (${finding.runsAtSeverity} of ${finding.runs} runs at this severity)`
      : "";

  // A critical or major is ruled on, which takes the reviewer's reason, not only its correction.
  const reason = RANK[finding.severity] >= RANK.major ? `\n  reason: ${finding.reason}` : "";

  return `- ${finding.severity} ${finding.category}${finding.unsure ? " (unsure)" : ""}${tally}${finding.run ? ` (${finding.run})` : ""}: ${describe(finding)} ${JSON.stringify(finding.msgstr)} → ${JSON.stringify(finding.correction)}${finding.source ? ` [${finding.source}]` : ""}${reason}${finding.dismissed ? `\n  dismissed: ${finding.dismissed}` : ""}`;
}

export function formatFindings(result: MqmRunsResult) {
  const lines: string[] = [];

  const open = result.findings.filter(({ applied }) => !applied);

  for (const [title, findings] of [
    [
      "critical and major, blocking until each is applied or dismissed",
      open
        .filter(blocks)
        .flatMap(({ all }) => all.filter((finding) => RANK[finding.severity] >= RANK.major)),
    ],
    ["minor, to correct", open.filter(({ severity }) => severity === "minor")],
    ["term-level, to settle in the sidecar", open.filter(({ source }) => source)],
    ["applied since the runs assessed them", result.findings.filter(({ applied }) => applied)],
    ["dismissed, each left out of its run's score and the gate", result.dismissed],
  ] as const) {
    if (findings.length > 0) {
      lines.push(`${result.locale}, ${title}:`, ...findings.map(formatFinding));
    }
  }

  return lines.join("\n");
}

/*
 * A round's three reviewers write `<tag>.mqm.1.json` to `<tag>.mqm.3.json`; a
 * lone `<tag>.mqm.json` is one run, as a test or a partial rerun writes it.
 * Both at once is ambiguous, so it is refused rather than one set guessed at.
 */
export async function readRuns(dir: string, locale: string) {
  const prefix = `${locale}.mqm.`;

  const names = (await readdir(dir))
    .flatMap((name) => {
      const run = name.startsWith(prefix) ? /^(\d+)\.json$/u.exec(name.slice(prefix.length)) : null;

      return run?.[1] === undefined ? [] : [{ name, run: Number(run[1]) }];
    })
    .sort((a, b) => a.run - b.run)
    .map(({ name }) => name);

  const single = `${locale}.mqm.json`;

  const hasSingle = await Bun.file(path.join(dir, single)).exists();

  if (hasSingle && names.length > 0) {
    throw new Error(
      `${dir} holds both ${single} and ${names.join(", ")}; move one set aside, such as an earlier round's.`,
    );
  }

  if (!hasSingle && names.length === 0) {
    throw new Error(`${dir} holds no ${single} and no ${locale}.mqm.<run>.json.`);
  }

  return Promise.all(
    (hasSingle ? [single] : names).map(async (name) => ({
      name,
      findings: (await Bun.file(path.join(dir, name)).json()) as unknown,
    })),
  );
}

const USAGE = `Usage: bun .claude/skills/translate/mqm.ts --dir <dir> [--partial] <tag>…
       bun .claude/skills/translate/mqm.ts --dir <dir> --list [--base <ref>] <tag>…
       bun .claude/skills/translate/mqm.ts --dir <dir> --corrected <tag>…

Scores each locale's MQM findings against its catalogs: the runs
<dir>/<tag>.mqm.<run>.json, every finding of any run counting, or one run's
<dir>/<tag>.mqm.json. The score is the median run's and is reported only; a
critical or major finding blocks until it is dismissed in a run's file or
applied, the catalog no longer holding what <dir>/<tag>.dump.txt showed the
runs. Writes the findings still open, one per entry with every run's, to
<dir>/<tag>.mqm.corrections.json. A full run assesses every live entry of both
catalogs; with --partial, only the entries in <dir>/<tag>.assess.txt.

--list writes <dir>/<tag>.assess.txt for a partial run: the entries collect.ts
listed in <dir>/<tag>.txt, and every other entry whose translation differs from
the catalog at the merge base with --base (beta by default).

--corrected writes <dir>/<tag>.assess.txt for scoring the corrections: every
entry whose translation differs from <dir>/<tag>.dump.txt, which must still be
the dump the runs read.

Exit codes: 0 every locale passes, 1 a locale is blocked, 2 the input is invalid.`;

async function run() {
  const { values, positionals } = parseArgs({
    options: {
      dir: { type: "string" },
      partial: { type: "boolean" },
      list: { type: "boolean" },
      corrected: { type: "boolean" },
      base: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(USAGE);

    return;
  }

  if (!values.dir || positionals.length === 0) {
    console.error(USAGE);

    process.exit(2);
  }

  const config = getConfig();

  const results: MqmRunsResult[] = [];

  const errors: string[] = [];

  for (const locale of positionals) {
    if (locale === config.sourceLocale || !config.locales.includes(locale)) {
      errors.push(
        `${locale}: not a translated locale; use one of ${config.locales.filter((tag) => tag !== config.sourceLocale).join(", ")}.`,
      );

      continue;
    }

    const catalogs = await Promise.all(
      catalogFiles(config, locale).map(async ({ name, absolute, relative }) => ({
        name,
        catalog: await parse(
          await Bun.file(absolute).text(),
          locale,
          config.sourceLocale,
          relative,
        ),
      })),
    );

    const assessPath = path.join(values.dir, `${locale}.assess.txt`);

    if (values.list) {
      const entryFile = Bun.file(path.join(values.dir, `${locale}.txt`));

      const listed = (await entryFile.exists()) ? parseEntryFile(await entryFile.text()) : [];

      const earlierRef = resolveBase(values.base);

      const earlier = await Promise.all(
        catalogFiles(config, locale).map(async ({ name, relative }) => {
          const text = readAtRef(earlierRef, relative);

          return {
            name,
            catalog: text ? await parse(text, locale, config.sourceLocale, relative) : {},
          };
        }),
      );

      const entries = uniqueEntries([...listed, ...changedEntries(catalogs, earlier)]);

      await Bun.write(assessPath, formatEntryList(locale, entries));

      console.log(`${assessPath}: ${entries.length} entries to assess`);

      continue;
    }

    if (values.corrected) {
      const entries = correctedEntries(
        catalogs,
        parseDump(await Bun.file(path.join(values.dir, `${locale}.dump.txt`)).text()),
      );

      await Bun.write(assessPath, formatEntryList(locale, entries));

      console.log(`${assessPath}: ${entries.length} corrected entries to assess`);

      continue;
    }

    const entries = values.partial ? parseEntryFile(await Bun.file(assessPath).text()) : undefined;

    const dump = Bun.file(path.join(values.dir, `${locale}.dump.txt`));

    const scored = scoreRuns({
      locale,
      catalogs,
      runs: await readRuns(values.dir, locale),
      entries,
      assessed: (await dump.exists()) ? parseDump(await dump.text()) : undefined,
    });

    errors.push(...scored.errors.map((error) => `${locale}: ${error}`));

    if (scored.result) {
      results.push(scored.result);

      await Bun.write(
        path.join(values.dir, `${locale}.mqm.corrections.json`),
        `${JSON.stringify(
          scored.result.findings.filter(({ applied }) => !applied),
          null,
          2,
        )}\n`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(errors.join("\n"));

    process.exit(2);
  }

  if (values.list || values.corrected) {
    return;
  }

  console.log(formatTable(results));

  for (const result of results) {
    for (const warning of result.warnings) {
      console.error(`${result.locale}: ${warning}`);
    }

    const findings = formatFindings(result);

    if (findings) {
      console.log(`\n${findings}`);
    }
  }

  if (results.some(({ passes }) => !passes)) {
    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await run();
  } catch (error) {
    console.error(`mqm.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
