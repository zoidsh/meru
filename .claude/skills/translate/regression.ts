import { exists, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkCatalogs, type Report } from "./check";
import { type Catalog, dumpCatalogs, parse, sliceGlossary } from "./collect";
import {
  type EntryFinding,
  CATEGORIES,
  describe,
  formatEntryList,
  keyOf,
  liveEntries,
  type MqmSeverity,
  RANK,
  readRuns,
  scoreRuns,
  SEVERITIES,
} from "./mqm";
import { loadSidecar } from "./rules";

/*
 * Measures the MQM reviewers on a fixed set per language,
 * `regression/<tag>.po`: entries whose shipped translation was accepted, and
 * known-bad ones, each marked with the error it holds as `# expect: <category>
 * <minimum severity>`, `|` between categories that would each name it. Recall
 * is how many known-bad entries any run reports at their severity or above, as
 * step 6's gate counts them; a false positive is any run's finding on an
 * accepted entry, which the orchestrator would have to dismiss. The pipeline
 * reviewer is measured on the same set and the same tallies, any of its
 * findings on a known-bad entry catching it, since it grades none. It needs
 * the agents, so it never runs in CI.
 */

const REGRESSION_DIR = path.join(import.meta.dir, "regression");

const REPOSITORY = path.join(import.meta.dir, "../../..");

const EXPECT_PREFIX = "expect: ";

const CATALOG_PREFIX = "catalog: ";

const FEW_SHOT = "few-shot";

const HARD = "hard";

export const RUNS = 3;

export const MEASUREMENTS = 2;

type Category = (typeof CATEGORIES)[number];

export type Expectation = {
  catalog: string;
  msgctxt: string | null;
  msgid: string;
  categories: Category[];
  severity: MqmSeverity;
  /** One of the reviewer prompt's own examples, so catching it says less. */
  fewShot: boolean;
  /** An error no sidecar rule names, which the reviewer has to read for. */
  hard: boolean;
};

export type RegressionSet = {
  catalogs: { name: string; relative: string; catalog: Catalog }[];
  expectations: Expectation[];
  accepted: number;
};

function translatorComments(entry: Catalog[string]) {
  return (entry.extra as { translatorComments?: string[] } | undefined)?.translatorComments ?? [];
}

/*
 * The set's translator comments carry the answers; the dump the reviewers read
 * holds only the `#.` comments and origins, so they never see them.
 */
export async function loadRegressionSet(
  locale: string,
  file = path.join(REGRESSION_DIR, `${locale}.po`),
) {
  const parsed = await parse(await Bun.file(file).text(), locale, "en", path.basename(file));

  const catalogs = new Map<string, Catalog>([
    ["app", {}],
    ["preload-gmail", {}],
  ]);

  const expectations: Expectation[] = [];

  let accepted = 0;

  for (const [id, entry] of Object.entries(parsed)) {
    const comments = translatorComments(entry);

    const name =
      comments
        .find((comment) => comment.startsWith(CATALOG_PREFIX))
        ?.slice(CATALOG_PREFIX.length) ?? "app";

    const catalog = catalogs.get(name);

    if (!catalog) {
      throw new Error(`${file}: ${JSON.stringify(id)} names the catalog ${name}.`);
    }

    catalog[id] = entry;

    const expect = comments.find((comment) => comment.startsWith(EXPECT_PREFIX));

    if (expect === undefined) {
      accepted++;

      continue;
    }

    const [categories = "", severity, ...rest] = expect.slice(EXPECT_PREFIX.length).split(" ");

    const parsedCategories = categories.split("|") as Category[];

    if (
      rest.length > 0 ||
      !SEVERITIES.includes(severity as MqmSeverity) ||
      !parsedCategories.every((category) => CATEGORIES.includes(category))
    ) {
      throw new Error(
        `${file}: ${JSON.stringify(id)} has ${JSON.stringify(expect)}; write "expect: <category>[|<category>] <severity>".`,
      );
    }

    expectations.push({
      catalog: name,
      msgctxt: entry.context ?? null,
      msgid: entry.message ?? id,
      categories: parsedCategories,
      severity: severity as MqmSeverity,
      fewShot: comments.includes(FEW_SHOT),
      hard: comments.includes(HARD),
    });
  }

  return {
    catalogs: [...catalogs].map(([name, catalog]) => ({
      name,
      relative: `regression set, ${name} catalog`,
      catalog,
    })),
    expectations,
    accepted,
  } satisfies RegressionSet;
}

export type Recall = { expected: number; caught: number };

/*
 * A finding from any judge: an MQM run's carries a severity and category, which
 * a catch must reach; the pipeline reviewer's and check.ts's carry a `kind`
 * instead, and any of them on a known-bad entry catches it.
 */
export type Flag = {
  catalog: string;
  msgctxt: string | null;
  msgid: string;
  msgstr: string;
  reason: string;
  correction: string;
  severity?: MqmSeverity;
  category?: string;
  kind?: string;
};

export type RegressionScore = {
  name: string;
  recall: Record<MqmSeverity, Recall>;
  total: Recall;
  /** The same, leaving out the entries the reviewer prompt shows as examples. */
  withoutFewShot: Recall;
  hard: Recall;
  /** Caught entries whose finding names one of the expected categories, for a judge that names one. */
  categoryMatches?: number;
  missed: Expectation[];
  /** Flagged, but below the expected severity, so not caught. */
  underGraded: { expectation: Expectation; finding: Flag }[];
  falsePositives: Flag[];
  accepted: number;
  score?: number;
};

export function measure(
  name: string,
  set: RegressionSet,
  findings: Flag[],
  score?: number,
): RegressionScore {
  const byEntry = new Map(findings.map((finding) => [keyOf(finding), finding]));

  const expected = new Set(set.expectations.map(keyOf));

  const recall = Object.fromEntries(
    SEVERITIES.map((severity) => [severity, { expected: 0, caught: 0 }]),
  ) as Record<MqmSeverity, Recall>;

  const total = { expected: 0, caught: 0 };

  const withoutFewShot = { expected: 0, caught: 0 };

  const hard = { expected: 0, caught: 0 };

  const missed: Expectation[] = [];

  const underGraded: RegressionScore["underGraded"] = [];

  let categoryMatches = 0;

  for (const expectation of set.expectations) {
    const finding = byEntry.get(keyOf(expectation));

    const caught =
      finding !== undefined &&
      (finding.severity === undefined || RANK[finding.severity] >= RANK[expectation.severity]);

    for (const tally of [
      recall[expectation.severity],
      total,
      ...(expectation.fewShot ? [] : [withoutFewShot]),
      ...(expectation.hard ? [hard] : []),
    ]) {
      tally.expected++;

      if (caught) {
        tally.caught++;
      }
    }

    if (caught && expectation.categories.includes(finding.category as Category)) {
      categoryMatches++;
    } else if (!finding) {
      missed.push(expectation);
    } else if (!caught) {
      underGraded.push({ expectation, finding });
    }
  }

  return {
    name,
    recall,
    total,
    withoutFewShot,
    hard,
    categoryMatches: findings.some(({ category }) => category) ? categoryMatches : undefined,
    missed,
    underGraded,
    falsePositives: findings.filter((finding) => !expected.has(keyOf(finding))),
    accepted: set.accepted,
    score,
  };
}

/*
 * The combined result applies the step-6 rule, an entry counting at the most
 * severe finding any run reports; each run is measured alone too, so a weak
 * run shows.
 */
export function scoreRegression({
  locale,
  set,
  runs,
}: {
  locale: string;
  set: RegressionSet;
  runs: { name: string; findings: unknown }[];
}): {
  combined?: RegressionScore;
  runs: RegressionScore[];
  agreement?: RegressionAgreement;
  errors: string[];
} {
  const combined = scoreRuns({ locale, catalogs: set.catalogs, runs });

  if (!combined.result) {
    return { runs: [], errors: combined.errors };
  }

  const perRun = runs.map((run) => {
    const { result } = scoreRuns({ locale, catalogs: set.catalogs, runs: [run] });

    return measure(run.name, set, result?.findings ?? [], result?.score ?? 0);
  });

  const merged = measure(
    runs.length === 1 ? "1 run" : `${runs.length} runs, any`,
    set,
    combined.result.findings satisfies EntryFinding[],
    combined.result.score,
  );

  return {
    combined: merged,
    runs: perRun,
    agreement: agreementOf(set, perRun, combined.result.findings),
    errors: [],
  };
}

export type RegressionAgreement = {
  /** Index n: the known-bad entries exactly n runs caught at their severity. */
  catchesByRuns: number[];
  /** Index n: the accepted entries exactly n runs filed a finding on. */
  falsePositivesByRuns: number[];
};

/*
 * How much the gate leans on a single run: a catch only one run made is one a
 * vote between runs would drop, and a false positive one run filed is one the
 * orchestrator has to dismiss.
 */
function agreementOf(
  set: RegressionSet,
  runs: RegressionScore[],
  merged: EntryFinding[],
): RegressionAgreement {
  const caughtBy = (score: RegressionScore, expectation: Expectation) =>
    !score.missed.includes(expectation) &&
    !score.underGraded.some((graded) => graded.expectation === expectation);

  const catchesByRuns = Array.from({ length: runs.length + 1 }, () => 0);

  for (const expectation of set.expectations) {
    const count = runs.filter((run) => caughtBy(run, expectation)).length;

    catchesByRuns[count] = (catchesByRuns[count] ?? 0) + 1;
  }

  const expected = new Set(set.expectations.map(keyOf));

  const falsePositivesByRuns = Array.from({ length: runs.length + 1 }, () => 0);

  for (const finding of merged.filter((candidate) => !expected.has(keyOf(candidate)))) {
    const count = new Set(finding.all.map(({ run }) => run)).size;

    falsePositivesByRuns[count] = (falsePositivesByRuns[count] ?? 0) + 1;
  }

  falsePositivesByRuns[0] = set.accepted - falsePositivesByRuns.slice(1).reduce((a, b) => a + b, 0);

  return { catchesByRuns, falsePositivesByRuns };
}

function labelOf(finding: Flag) {
  return finding.kind ?? `${finding.severity} ${finding.category}`;
}

function ratio({ caught, expected }: Recall) {
  return expected === 0 ? "-" : `${caught}/${expected}`;
}

export function formatScores(title: string, scores: RegressionScore[]) {
  const rows = [
    [
      "Runs",
      "Critical",
      "Major",
      "Minor",
      "Recall",
      "Without few-shot",
      "Hard",
      "Category matches",
      "False positives",
      "Score",
    ],
    ["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:"],
    ...scores.map((result) => [
      result.name,
      ratio(result.recall.critical),
      ratio(result.recall.major),
      ratio(result.recall.minor),
      `${ratio(result.total)} (${((100 * result.total.caught) / Math.max(result.total.expected, 1)).toFixed(0)}%)`,
      ratio(result.withoutFewShot),
      ratio(result.hard),
      result.categoryMatches === undefined
        ? "-"
        : `${result.categoryMatches}/${result.total.caught}`,
      `${result.falsePositives.length}/${result.accepted}`,
      result.score === undefined ? "-" : result.score.toFixed(2),
    ]),
  ];

  return [`## ${title}`, "", ...rows.map((cells) => `| ${cells.join(" | ")} |`)].join("\n");
}

export function formatLists(title: string, score: RegressionScore) {
  const lines: string[] = [];

  for (const [heading, items] of [
    [
      "missed",
      score.missed.map(
        (expectation) =>
          `- ${describe(expectation)}: expected ${expectation.categories.join("|")} ${expectation.severity}`,
      ),
    ],
    [
      "flagged below the expected severity",
      score.underGraded.map(
        ({ expectation, finding }) =>
          `- ${describe(expectation)}: expected ${expectation.severity}, flagged ${labelOf(finding)}`,
      ),
    ],
    [
      "false positives on accepted entries",
      score.falsePositives.map(
        (finding) =>
          `- ${labelOf(finding)}: ${describe(finding)} ${JSON.stringify(finding.msgstr)} → ${JSON.stringify(finding.correction)}: ${finding.reason}`,
      ),
    ],
  ] as const) {
    if (items.length > 0) {
      lines.push(...(lines.length > 0 ? [""] : []), `${title}, ${heading}:`, ...items);
    }
  }

  return lines.join("\n");
}

export function formatRegression(
  locale: string,
  combined: RegressionScore,
  runs: RegressionScore[],
  agreement?: RegressionAgreement,
) {
  const sections = [formatScores(locale, [combined, ...(runs.length > 1 ? runs : [])])];

  if (agreement && runs.length > 1) {
    const byRuns = (counts: number[]) =>
      counts.map((count, runCount) => `${runCount} runs: ${count}`).join(", ");

    sections.push(
      `Known-bad entries caught by ${byRuns(agreement.catchesByRuns)}.\nAccepted entries flagged by ${byRuns(agreement.falsePositivesByRuns)}.`,
    );
  }

  sections.push(formatLists(locale, combined));

  return sections.filter(Boolean).join("\n\n");
}

export type Range = { min: number; max: number; of: number };

export type RegressionRange = {
  recall: Record<MqmSeverity, Range>;
  total: Range;
  withoutFewShot: Range;
  hard: Range;
  falsePositives: Range;
};

function rangeOf(values: number[], of: number): Range {
  return { min: Math.min(...values), max: Math.max(...values), of };
}

/*
 * One measurement of the same prompt has moved French recall by three entries,
 * so a result is the range of independent measurements, never one of them.
 */
export function regressionRange(measurements: RegressionScore[]): RegressionRange {
  const [first] = measurements;

  if (!first) {
    throw new Error("A range needs a measurement.");
  }

  const recall = (pick: (score: RegressionScore) => Recall) =>
    rangeOf(
      measurements.map((score) => pick(score).caught),
      pick(first).expected,
    );

  return {
    recall: Object.fromEntries(
      SEVERITIES.map((severity) => [severity, recall((score) => score.recall[severity])]),
    ) as Record<MqmSeverity, Range>,
    total: recall((score) => score.total),
    withoutFewShot: recall((score) => score.withoutFewShot),
    hard: recall((score) => score.hard),
    falsePositives: rangeOf(
      measurements.map((score) => score.falsePositives.length),
      first.accepted,
    ),
  };
}

function formatRangeValue({ min, max, of }: Range) {
  if (of === 0) {
    return "-";
  }

  return `${min === max ? min : `${min}–${max}`}/${of}`;
}

export function formatRange(title: string, measurements: RegressionScore[]) {
  const range = regressionRange(measurements);

  const row = (name: string, value: RegressionRange) => [
    name,
    formatRangeValue(value.recall.critical),
    formatRangeValue(value.recall.major),
    formatRangeValue(value.recall.minor),
    formatRangeValue(value.total),
    formatRangeValue(value.withoutFewShot),
    formatRangeValue(value.hard),
    formatRangeValue(value.falsePositives),
  ];

  const rows = [
    [
      "Measurement",
      "Critical",
      "Major",
      "Minor",
      "Recall",
      "Without few-shot",
      "Hard",
      "False positives",
    ],
    ["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:"],
    ...measurements.map((score) => row(score.name, regressionRange([score]))),
    row("Range", range),
  ];

  const lines = [`## ${title}`, "", ...rows.map((cells) => `| ${cells.join(" | ")} |`)];

  if (measurements.length < MEASUREMENTS) {
    lines.push(
      "",
      `One measurement only: a change to a reviewer's prompt or model, or to step 6, needs ${MEASUREMENTS}.`,
    );
  }

  return lines.join("\n");
}

/** The prompt the step-6 reviewers get, naming the set's dump as a full run's. */
export function reviewerPrompt(locale: string, dir: string, run: number, fullGlossary: boolean) {
  return [
    `Assess the ${locale} translation with MQM. This is a full run: assess every entry of the dump.`,
    `- Dump: ${path.join(dir, `${locale}.dump.txt`)}`,
    `- Style sheet: .claude/skills/translate/languages/${locale}.md, sidecar .claude/skills/translate/languages/${locale}.json`,
    `- Glossary slice: ${path.join(dir, `${locale}.glossary.md`)}${fullGlossary ? ", and the full .claude/skills/translate/glossary.md, since the slice skipped lines" : ""}`,
    `- Write your findings to ${path.join(dir, `${locale}.mqm.${run}.json`)}`,
  ].join("\n");
}

export function reviewerCommand(prompt: string, dir: string, agent = "translation-mqm-reviewer") {
  return [
    "claude",
    "-p",
    prompt,
    "--agent",
    agent,
    "--add-dir",
    dir,
    "--allowedTools",
    "Read,Grep,Glob,Write",
  ];
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** Each measurement's inputs and findings live in a directory of its own, so its runs are read as one round. */
export function measurementDir(dir: string, measurement: number) {
  return path.join(dir, String(measurement));
}

type Command = { locale: string; output: string; log: string; command: string[] };

/** Writes the set's dump and glossary slice, and any `extra` files, into each measurement's directory. */
async function writeMeasurements(
  locale: string,
  dir: string,
  extra: (set: RegressionSet) => Promise<Record<string, string>> = async () => ({}),
) {
  const set = await loadRegressionSet(locale);

  const { text, total } = dumpCatalogs(locale, set.catalogs);

  const glossary = sliceGlossary(
    await Bun.file(path.join(import.meta.dir, "glossary.md")).text(),
    locale,
  );

  const files = {
    [`${locale}.dump.txt`]: text,
    [`${locale}.glossary.md`]: glossary.text,
    ...(await extra(set)),
  };

  const dirs = Array.from({ length: MEASUREMENTS }, (_, index) => measurementDir(dir, index + 1));

  await Promise.all(
    dirs.map(async (into) => {
      await mkdir(into, { recursive: true });

      await Promise.all(
        Object.entries(files).map(([name, content]) => Bun.write(path.join(into, name), content)),
      );
    }),
  );

  console.log(
    `${locale}: ${total} entries, ${set.accepted} accepted and ${set.expectations.length} known-bad, in ${MEASUREMENTS} measurements under ${dir}`,
  );

  return { dirs, fullGlossary: glossary.warnings.length > 0 };
}

async function prepare(locale: string, dir: string): Promise<Command[]> {
  const { dirs, fullGlossary } = await writeMeasurements(locale, dir);

  return dirs.flatMap((into) =>
    Array.from({ length: RUNS }, (_, index) => ({
      locale,
      output: path.join(into, `${locale}.mqm.${index + 1}.json`),
      log: path.join(into, `${locale}.mqm.${index + 1}.log`),
      command: reviewerCommand(reviewerPrompt(locale, into, index + 1, fullGlossary), into),
    })),
  );
}

/*
 * The agents' frontmatter sets their model and effort, and the first two
 * variables would override it for every run measured. A headless run otherwise
 * stops waiting after ten minutes, which cut short a full French assessment.
 */
const UNSET = ["CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE"];

const SET = { CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: "0" };

function reviewerEnv() {
  const env: Record<string, string | undefined> = { ...process.env, ...SET };

  for (const name of UNSET) {
    delete env[name];
  }

  return env;
}

async function measured(dir: string) {
  const found: { measurement: number; dir: string }[] = [];

  for (let measurement = 1; measurement <= MEASUREMENTS; measurement++) {
    const into = measurementDir(dir, measurement);

    if (await exists(into)) {
      found.push({ measurement, dir: into });
    }
  }

  if (found.length === 0) {
    throw new Error(`${dir} holds no measurement; prepare writes ${measurementDir(dir, 1)}.`);
  }

  return found;
}

async function score(locale: string, dir: string) {
  const set = await loadRegressionSet(locale);

  const combined: RegressionScore[] = [];

  const missing: string[] = [];

  for (const { measurement, dir: into } of await measured(dir)) {
    const runs = await readRuns(into, locale).catch((error: unknown) => {
      missing.push(`${locale}, measurement ${measurement}: ${String(error)}`);

      return [];
    });

    const absent = Array.from(
      { length: RUNS },
      (_, index) => `${locale}.mqm.${index + 1}.json`,
    ).filter((name) => !runs.some((run) => run.name === name));

    if (absent.length > 0) {
      missing.push(
        `${locale}, measurement ${measurement}: missing ${absent.join(", ")}, so it is scored as ${runs.length} of ${RUNS} runs`,
      );
    }

    if (runs.length === 0) {
      continue;
    }

    const result = scoreRegression({ locale, set, runs });

    if (!result.combined) {
      throw new Error(result.errors.map((error) => `${locale}: ${error}`).join("\n"));
    }

    combined.push({
      ...result.combined,
      name: `${measurement}${absent.length > 0 ? `, ${runs.length} of ${RUNS} runs` : ""}`,
    });

    console.log(
      `${formatRegression(`${locale}, measurement ${measurement}`, result.combined, result.runs, result.agreement)}\n`,
    );
  }

  if (combined.length > 0) {
    console.log(`${formatRange(`${locale}, range`, combined)}\n`);
  }

  return missing;
}

/*
 * A run that fails leaves the others to score, but never an older findings
 * file in its place, so each output is removed before its run starts.
 */
async function runAll(commands: Command[]) {
  const failed = await Promise.all(
    commands.map(async ({ output, log, command }) => {
      await rm(output, { force: true });

      const child = Bun.spawn(command, {
        cwd: REPOSITORY,
        env: reviewerEnv(),
        stdout: Bun.file(log),
        stderr: "inherit",
        stdin: "ignore",
      });

      const code = await child.exited;

      console.log(`exit ${code}, ${log}`);

      return code === 0 ? [] : [`${output}: its run exited ${code}; see ${log}`];
    }),
  );

  return failed.flat();
}

export const REVIEW_KINDS = ["wrong", "improve"] as const;

/*
 * The pipeline reviewer's findings file, held as `mqm.ts` holds an MQM run's:
 * a finding on an entry the set lacks would vanish from the measurement.
 */
export function reviewFlags(
  set: RegressionSet,
  findings: unknown,
): { flags?: Flag[]; errors: string[] } {
  if (!Array.isArray(findings)) {
    return { errors: ["The findings file must hold a JSON array."] };
  }

  const entries = liveEntries(set.catalogs);

  const errors: string[] = [];

  const flags: Flag[] = [];

  for (const [index, item] of findings.entries()) {
    const record = (typeof item === "object" && item !== null ? item : {}) as Record<
      string,
      unknown
    >;

    const missing = ["catalog", "msgid", "msgstr", "reason", "suggestion"].filter(
      (field) => typeof record[field] !== "string",
    );

    if (record.msgctxt !== null && typeof record.msgctxt !== "string") {
      missing.push("msgctxt");
    }

    if (missing.length > 0) {
      errors.push(`Item ${index} needs ${missing.join(", ")}.`);

      continue;
    }

    if (!REVIEW_KINDS.includes(record.severity as (typeof REVIEW_KINDS)[number])) {
      errors.push(
        `Item ${index} has severity ${JSON.stringify(record.severity)}; use ${REVIEW_KINDS.join(", ")}.`,
      );

      continue;
    }

    const flag: Flag = {
      catalog: record.catalog as string,
      msgctxt: record.msgctxt as string | null,
      msgid: record.msgid as string,
      msgstr: record.msgstr as string,
      reason: record.reason as string,
      correction: record.suggestion as string,
      kind: `reviewer ${record.severity as string}`,
    };

    if (entries.has(keyOf(flag))) {
      flags.push(flag);
    } else {
      errors.push(`A finding names ${describe(flag)}, which the set doesn't hold.`);
    }
  }

  return errors.length > 0 ? { errors } : { flags, errors };
}

/*
 * Both scripts parse with Lingui's PO format; collect.ts only narrows the type.
 * Each catalog's path is its name, so check.ts's findings key as the set's do.
 */
export function checkInput(set: RegressionSet) {
  return set.catalogs.map(({ name, catalog }) => ({
    path: name,
    catalog: catalog as unknown as Parameters<typeof checkCatalogs>[2][number]["catalog"],
  }));
}

/** Every check.ts finding, each of which step 4 sends to the translator beside the reviewer's. */
export function checkFlags(report: Report): Flag[] {
  return report.findings.map((finding) => ({
    catalog: finding.catalog,
    msgctxt: finding.msgctxt,
    msgid: finding.msgid,
    msgstr: finding.msgstr,
    reason: finding.reason,
    correction: finding.detail,
    kind: `check.ts ${finding.rule}:${finding.id}`,
  }));
}

export type ReviewScore = {
  reviewer: RegressionScore;
  /** What step 4 sends the translator: the reviewer's findings and check.ts's. */
  withCheck: RegressionScore;
  /** Known-bad critical and major entries the reviewer caught, and how many of them as `wrong`, so re-reviewed. */
  breaches: { caught: number; asWrong: number };
};

export function scoreReview(
  set: RegressionSet,
  findings: unknown,
  check: Flag[],
): { result?: ReviewScore; errors: string[] } {
  const { flags, errors } = reviewFlags(set, findings);

  if (!flags) {
    return { errors };
  }

  const serious = new Set(
    set.expectations.filter(({ severity }) => RANK[severity] >= RANK.major).map(keyOf),
  );

  const onSerious = flags.filter((flag) => serious.has(keyOf(flag)));

  return {
    result: {
      reviewer: measure("reviewer", set, flags),
      withCheck: measure("reviewer and check.ts", set, [...check, ...flags]),
      breaches: {
        caught: new Set(onSerious.map(keyOf)).size,
        asWrong: new Set(onSerious.filter(({ kind }) => kind === "reviewer wrong").map(keyOf)).size,
      },
    },
    errors: [],
  };
}

/** The prompt step 4 gives the pipeline reviewer, naming the set's files as a first translation's. */
export function pipelineReviewerPrompt(locale: string, dir: string, fullGlossary: boolean) {
  return [
    `Review the ${locale} translations. The entry file lists every entry, as in a locale's first translation.`,
    `- Entry file: ${path.join(dir, `${locale}.txt`)}`,
    `- Dump: ${path.join(dir, `${locale}.dump.txt`)}`,
    `- check.ts report: ${path.join(dir, `${locale}.check.json`)}`,
    `- Style sheet: .claude/skills/translate/languages/${locale}.md, sidecar .claude/skills/translate/languages/${locale}.json`,
    `- Glossary slice: ${path.join(dir, `${locale}.glossary.md`)}${fullGlossary ? ", and the full .claude/skills/translate/glossary.md, since the slice skipped lines" : ""}`,
    `- Write your findings to ${path.join(dir, `${locale}.review.json`)}`,
    "Look up Lingui syntax in the Markdown copy of a docs page, the page URL with .md appended, such as https://lingui.dev/ref/macro.md, rather than guess.",
  ].join("\n");
}

async function prepareReviewer(locale: string, dir: string): Promise<Command[]> {
  const { dirs, fullGlossary } = await writeMeasurements(locale, dir, async (set) => ({
    [`${locale}.txt`]: formatEntryList(
      locale,
      [...liveEntries(set.catalogs).values()].map(({ catalog, msgctxt, msgid }) => ({
        catalog,
        msgctxt,
        msgid,
      })),
    ),
    [`${locale}.check.json`]: `${JSON.stringify(
      checkCatalogs(locale, await loadSidecar(locale), checkInput(set)),
      null,
      2,
    )}\n`,
  }));

  return dirs.map((into) => ({
    locale,
    output: path.join(into, `${locale}.review.json`),
    log: path.join(into, `${locale}.review.log`),
    command: reviewerCommand(
      pipelineReviewerPrompt(locale, into, fullGlossary),
      into,
      "translation-reviewer",
    ),
  }));
}

async function scoreReviewer(locale: string, dir: string) {
  const set = await loadRegressionSet(locale);

  const missing: string[] = [];

  const check = checkFlags(checkCatalogs(locale, await loadSidecar(locale), checkInput(set)));

  const reviewers: RegressionScore[] = [];

  const withCheck: RegressionScore[] = [];

  const breaches: string[] = [];

  for (const { measurement, dir: into } of await measured(dir)) {
    const file = Bun.file(path.join(into, `${locale}.review.json`));

    if (!(await file.exists())) {
      missing.push(`${locale}, measurement ${measurement}: missing ${locale}.review.json`);

      continue;
    }

    const { result, errors } = scoreReview(set, await file.json(), check);

    if (!result) {
      throw new Error(
        errors.map((error) => `${locale}, measurement ${measurement}: ${error}`).join("\n"),
      );
    }

    reviewers.push({ ...result.reviewer, name: `reviewer, measurement ${measurement}` });
    withCheck.push({ ...result.withCheck, name: `with check.ts, measurement ${measurement}` });
    breaches.push(
      `measurement ${measurement}: ${result.breaches.asWrong} of ${result.breaches.caught}`,
    );
  }

  if (reviewers.length === 0) {
    return missing;
  }

  console.log(
    [
      formatScores(`${locale}, pipeline reviewer`, [
        ...reviewers,
        ...withCheck,
        measure("check.ts alone", set, check),
      ]),
      `Known-bad critical and major entries the reviewer caught that it filed as wrong, so re-reviewed: ${breaches.join(", ")}.`,
      formatRange(`${locale}, reviewer range`, reviewers),
      formatRange(`${locale}, with check.ts range`, withCheck),
      ...reviewers.map((reviewer) => formatLists(reviewer.name, reviewer)),
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  return missing;
}

const USAGE = `Usage: bun .claude/skills/translate/regression.ts prepare --dir <dir> [--agent reviewer] <tag>…
       bun .claude/skills/translate/regression.ts run --dir <dir> [--agent reviewer] <tag>…
       bun .claude/skills/translate/regression.ts score --dir <dir> [--agent reviewer] <tag>…

Measures a reviewer on regression/<tag>.po, ${MEASUREMENTS} independent measurements
in <dir>/1 and <dir>/2: by default the step-6 MQM reviewers, ${RUNS} runs per
measurement, and with --agent reviewer the step-4 pipeline reviewer, one per
measurement, beside check.ts's findings on the same set.

prepare  writes each measurement's inputs from the set and prints the reviewer
         commands, to run all at once from the repository.
run      prepares, runs every reviewer of every locale and measurement in parallel,
         headless, each logging beside its findings file, then scores.
score    reports each measurement's recall per severity and false positives, then
         the range across the measurements.`;

const AGENTS = {
  mqm: { prepare, score },
  reviewer: { prepare: prepareReviewer, score: scoreReviewer },
};

async function run() {
  const { values, positionals } = parseArgs({
    options: {
      dir: { type: "string" },
      agent: { type: "string", default: "mqm" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  const [mode, ...locales] = positionals;

  if (values.help) {
    console.log(USAGE);

    return;
  }

  const agent = AGENTS[values.agent as keyof typeof AGENTS];

  if (
    !values.dir ||
    !agent ||
    !["prepare", "run", "score"].includes(mode ?? "") ||
    locales.length === 0
  ) {
    console.error(USAGE);

    process.exit(2);
  }

  const dir = path.resolve(values.dir);

  const problems: string[] = [];

  if (mode !== "score") {
    const commands = (
      await Promise.all(locales.map(async (locale) => agent.prepare(locale, dir)))
    ).flat();

    if (mode === "prepare") {
      console.log(
        `\nFrom ${REPOSITORY}, all at once:\n\n${commands
          .map(
            ({ command }) =>
              `env ${UNSET.map((name) => `-u ${name}`).join(" ")} ${Object.entries(SET)
                .map(([name, value]) => `${name}=${value}`)
                .join(" ")} ${command.map(shellQuote).join(" ")}`,
          )
          .join("\n\n")}`,
      );

      return;
    }

    problems.push(...(await runAll(commands)));
  }

  for (const locale of locales) {
    problems.push(...(await agent.score(locale, dir)));
  }

  if (problems.length > 0) {
    console.error(
      `\nINCOMPLETE: these measurements are short of runs and say so above; rerun the missing ones before recording them.\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );

    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await run();
  } catch (error) {
    console.error(`regression.ts: ${error instanceof Error ? error.message : String(error)}`);

    process.exit(2);
  }
}
