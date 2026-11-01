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
 * agent does the arithmetic. Each error costs its severity's points, the score
 * is 100 × (1 − points / source words), and the gate fails on any critical or
 * major error most runs agree on, and in a full run on a median score under 99
 * too: over the few words of a partial run a score means little. A finding the
 * orchestrator dismissed, with its reason, counts toward neither and is listed
 * instead.
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

export const PASSING_SCORE = 99;

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
export function scoreLocale({
  locale,
  catalogs,
  findings,
  entries,
}: {
  locale: string;
  catalogs: { name: string; catalog: Catalog }[];
  findings: unknown;
  /** The entries a partial run assessed; without them, every live entry is. */
  entries?: AssessedEntry[];
}): { result?: MqmResult; errors: string[] } {
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

  const errors: string[] = [];

  let assessed = [...live.values()];

  if (entries) {
    assessed = [];

    for (const entry of entries) {
      const found = live.get(keyOf(entry));

      if (found) {
        assessed.push(found);
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

  const assessedByKey = new Map(assessed.map((entry) => [keyOf(entry), entry]));

  const warnings: string[] = [];

  for (const finding of findings as MqmFinding[]) {
    const entry = assessedByKey.get(keyOf(finding));

    if (!entry) {
      errors.push(`A finding names ${describe(finding)}, which this run didn't assess.`);
    } else if (entry.msgstr !== finding.msgstr) {
      warnings.push(
        `A finding on ${describe(finding)} quotes ${JSON.stringify(finding.msgstr)}, but the catalog holds ${JSON.stringify(entry.msgstr)}.`,
      );
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const scored = (findings as MqmFinding[]).filter(({ dismissed }) => dismissed === undefined);

  const dismissed = (findings as MqmFinding[]).filter(({ dismissed }) => dismissed !== undefined);

  const words = assessed.reduce((total, { msgid }) => total + countWords(msgid), 0);

  const counts = countSeverities(scored);

  const scoring = scoreOf(penaltyOf(counts), words);

  const partial = entries !== undefined;

  return {
    result: {
      locale,
      partial,
      entries: assessed.length,
      words,
      counts,
      ...scoring,
      passes: passesGate(counts, scoring.score, partial),
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

function passesGate(counts: Record<MqmSeverity, number>, score: number, partial: boolean) {
  return counts.critical === 0 && counts.major === 0 && (partial || score >= PASSING_SCORE);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export const RANK: Record<MqmSeverity, number> = { minor: 1, major: 2, critical: 3 };

export type AgreedFinding = MqmFinding & { agreement: number; runs: number };

export type EntryAgreement = {
  entry: AssessedEntry;
  /** Each run's most severe finding on the entry, undefined where the run has none. */
  perRun: (MqmFinding | undefined)[];
  agreed?: AgreedFinding;
};

/*
 * An LLM judge over-flags and varies from run to run, so an error counts only
 * when most runs see it: an entry takes the median of the runs' severities, a
 * run without a finding counting as none, which for three runs is the highest
 * severity at least two report at or above. Runs are matched by entry, not by
 * category, since two runs often file one error under different categories.
 */
export function agreeOnEntries(runs: MqmFinding[][]) {
  const byEntry = new Map<string, EntryAgreement>();

  for (const [index, findings] of runs.entries()) {
    for (const finding of findings) {
      const key = keyOf(finding);

      const agreement = byEntry.get(key) ?? {
        entry: { catalog: finding.catalog, msgctxt: finding.msgctxt, msgid: finding.msgid },
        perRun: runs.map(() => undefined),
      };

      const current = agreement.perRun[index];

      if (!current || RANK[finding.severity] > RANK[current.severity]) {
        agreement.perRun[index] = finding;
      }

      byEntry.set(key, agreement);
    }
  }

  const needed = Math.floor(runs.length / 2) + 1;

  for (const agreement of byEntry.values()) {
    const reported = agreement.perRun.filter((finding) => finding !== undefined);

    const atLeast = (severity: MqmSeverity) =>
      reported.filter((finding) => RANK[finding.severity] >= RANK[severity]);

    const severity = SEVERITIES.find((candidate) => atLeast(candidate).length >= needed);

    const representative = reported.find((finding) => finding.severity === severity);

    if (severity && representative) {
      agreement.agreed = {
        ...representative,
        agreement: atLeast(severity).length,
        runs: runs.length,
      };
    }
  }

  return [...byEntry.values()];
}

export type RunScore = {
  name: string;
  counts: Record<MqmSeverity, number>;
  penalty: number;
  score: number;
};

export type MqmRunsResult = Omit<MqmResult, "findings"> & {
  findings: AgreedFinding[];
  /** Findings above their entry's agreed severity, which no majority shares: listed, never counted. */
  single: (MqmFinding & { run: string })[];
  runs: RunScore[];
};

/*
 * Scores each run on its own, then counts only what most runs agree on. The
 * score is the median run's, so one lenient or harsh run moves it no more than
 * a finding only it reports moves the gate. A dismissal is the orchestrator's
 * ruling on an entry, so one written in any run's file takes that entry out of
 * every run. One run alone scores as `scoreLocale` does.
 */
export function scoreRuns({
  locale,
  catalogs,
  runs,
  entries,
}: {
  locale: string;
  catalogs: { name: string; catalog: Catalog }[];
  runs: { name: string; findings: unknown }[];
  entries?: AssessedEntry[];
}): { result?: MqmRunsResult; errors: string[] } {
  const scored = runs.map(({ name, findings }) => ({
    name,
    ...scoreLocale({ locale, catalogs, findings, entries }),
  }));

  const errors = scored.flatMap(({ name, errors }) => errors.map((error) => `${name}: ${error}`));

  const results = scored.flatMap(({ name, result }) => (result ? [{ name, result }] : []));

  const [first] = results;

  if (errors.length > 0 || !first) {
    return { errors: errors.length > 0 ? errors : ["No findings file to score."] };
  }

  /* Each dismissed entry is listed with the dismissals of the first run that has any, so one written into every run's file is listed once. */
  const dismissedByEntry = new Map<string, { run: string; findings: MqmFinding[] }>();

  for (const { name, result } of results) {
    for (const finding of result.dismissed) {
      const listed = dismissedByEntry.get(keyOf(finding)) ?? { run: name, findings: [] };

      if (listed.run === name) {
        dismissedByEntry.set(keyOf(finding), {
          run: name,
          findings: [...listed.findings, finding],
        });
      }
    }
  }

  const live = results.map(({ result }) =>
    result.findings.filter((finding) => !dismissedByEntry.has(keyOf(finding))),
  );

  const { words, partial } = first.result;

  const runScores = results.map(({ name }, index) => {
    const counts = countSeverities(live[index] ?? []);

    return { name, counts, ...scoreOf(penaltyOf(counts), words) };
  });

  const agreements = agreeOnEntries(live);

  const findings = agreements.flatMap(({ agreed }) => (agreed ? [agreed] : []));

  const single = agreements.flatMap(({ perRun, agreed }) =>
    perRun.flatMap((finding, index) =>
      finding && (!agreed || RANK[finding.severity] > RANK[agreed.severity])
        ? [{ ...finding, run: results[index]?.name ?? "" }]
        : [],
    ),
  );

  const counts = countSeverities(findings);

  const scoring = scoreOf(median(runScores.map(({ penalty }) => penalty)), words);

  return {
    result: {
      ...first.result,
      counts,
      ...scoring,
      passes: passesGate(counts, scoring.score, partial),
      findings,
      single,
      dismissed: [...dismissedByEntry.values()].flatMap(({ findings }) => findings),
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
      "Score",
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
      result.passes ? "pass" : "FAIL",
    ]),
  ];

  return rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

function formatFinding(finding: MqmFinding & { agreement?: number; runs?: number; run?: string }) {
  const tally =
    finding.runs && finding.runs > 1 ? ` (${finding.agreement} of ${finding.runs} runs)` : "";

  return `- ${finding.severity} ${finding.category}${finding.unsure ? " (unsure)" : ""}${tally}${finding.run ? ` (${finding.run})` : ""}: ${describe(finding)} ${JSON.stringify(finding.msgstr)} → ${JSON.stringify(finding.correction)}${finding.source ? ` [${finding.source}]` : ""}${finding.dismissed ? `\n  dismissed: ${finding.dismissed}` : ""}`;
}

function formatFindings(result: MqmRunsResult) {
  const lines: string[] = [];

  for (const [title, findings] of [
    [
      "critical and major, to fix and score again",
      result.findings.filter(({ severity }) => severity !== "minor"),
    ],
    ["minor", result.findings.filter(({ severity }) => severity === "minor")],
    ["term-level, to settle in the sidecar", result.findings.filter(({ source }) => source)],
    ["single-run, not counted, to consider", result.single],
    ["dismissed, left out of the score", result.dismissed],
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

Scores each locale's MQM findings against its catalogs: the runs
<dir>/<tag>.mqm.<run>.json, counting what most of them agree on, or one run's
<dir>/<tag>.mqm.json. Writes the agreed findings, the ones to correct, to
<dir>/<tag>.mqm.agreed.json. A full run assesses every live entry of both
catalogs; with --partial, only the entries in <dir>/<tag>.assess.txt.

--list writes <dir>/<tag>.assess.txt for a partial run: the entries collect.ts
listed in <dir>/<tag>.txt, and every other entry whose translation differs from
the catalog at the merge base with --base (beta by default).

Exit codes: 0 every locale passes, 1 a locale fails the gate, 2 the input is invalid.`;

async function run() {
  const { values, positionals } = parseArgs({
    options: {
      dir: { type: "string" },
      partial: { type: "boolean" },
      list: { type: "boolean" },
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

    const entries = values.partial ? parseEntryFile(await Bun.file(assessPath).text()) : undefined;

    const scored = scoreRuns({
      locale,
      catalogs,
      runs: await readRuns(values.dir, locale),
      entries,
    });

    errors.push(...scored.errors.map((error) => `${locale}: ${error}`));

    if (scored.result) {
      results.push(scored.result);

      await Bun.write(
        path.join(values.dir, `${locale}.mqm.agreed.json`),
        `${JSON.stringify(scored.result.findings, null, 2)}\n`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(errors.join("\n"));

    process.exit(2);
  }

  if (values.list) {
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
