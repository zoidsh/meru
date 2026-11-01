import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Catalog, dumpCatalogs, parse, sliceGlossary } from "./collect";
import {
  type AgreedFinding,
  CATEGORIES,
  type MqmFinding,
  type MqmSeverity,
  RANK,
  readRuns,
  scoreRuns,
  SEVERITIES,
} from "./mqm";

/*
 * Measures the MQM reviewers on a fixed set per language,
 * `regression/<tag>.po`: entries whose shipped translation was accepted, and
 * known-bad ones, each marked with the error it holds as `# expect: <category>
 * <minimum severity>`, `|` between categories that would each name it. Recall
 * is how many known-bad entries the runs agree on at their severity or above;
 * a false positive is an agreed finding on an accepted entry. It needs the
 * agents, so it never runs in CI.
 */

const REGRESSION_DIR = path.join(import.meta.dir, "regression");

const REPOSITORY = path.join(import.meta.dir, "../../..");

const EXPECT_PREFIX = "expect: ";

const CATALOG_PREFIX = "catalog: ";

const FEW_SHOT = "few-shot";

export const RUNS = 3;

type Category = (typeof CATEGORIES)[number];

export type Expectation = {
  catalog: string;
  msgctxt: string | null;
  msgid: string;
  categories: Category[];
  severity: MqmSeverity;
  /** One of the reviewer prompt's own examples, so catching it says less. */
  fewShot: boolean;
};

export type RegressionSet = {
  catalogs: { name: string; relative: string; catalog: Catalog }[];
  expectations: Expectation[];
  accepted: number;
};

function keyOf({
  catalog,
  msgctxt,
  msgid,
}: {
  catalog: string;
  msgctxt: string | null;
  msgid: string;
}) {
  return `${catalog}\u0004${msgctxt ?? ""}\u0004${msgid}`;
}

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

export type RegressionScore = {
  name: string;
  recall: Record<MqmSeverity, Recall>;
  total: Recall;
  /** The same, leaving out the entries the reviewer prompt shows as examples. */
  withoutFewShot: Recall;
  /** Caught entries whose finding names one of the expected categories. */
  categoryMatches: number;
  missed: Expectation[];
  /** Flagged, but below the expected severity, so not caught. */
  underGraded: { expectation: Expectation; finding: MqmFinding }[];
  falsePositives: MqmFinding[];
  accepted: number;
  score: number;
};

function measure(
  name: string,
  set: RegressionSet,
  findings: MqmFinding[],
  score: number,
): RegressionScore {
  const byEntry = new Map(findings.map((finding) => [keyOf(finding), finding]));

  const expected = new Set(set.expectations.map(keyOf));

  const recall = Object.fromEntries(
    SEVERITIES.map((severity) => [severity, { expected: 0, caught: 0 }]),
  ) as Record<MqmSeverity, Recall>;

  const total = { expected: 0, caught: 0 };

  const withoutFewShot = { expected: 0, caught: 0 };

  const missed: Expectation[] = [];

  const underGraded: RegressionScore["underGraded"] = [];

  let categoryMatches = 0;

  for (const expectation of set.expectations) {
    const finding = byEntry.get(keyOf(expectation));

    const caught = finding !== undefined && RANK[finding.severity] >= RANK[expectation.severity];

    for (const tally of [
      recall[expectation.severity],
      total,
      ...(expectation.fewShot ? [] : [withoutFewShot]),
    ]) {
      tally.expected++;

      if (caught) {
        tally.caught++;
      }
    }

    if (caught && expectation.categories.includes(finding.category)) {
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
    categoryMatches,
    missed,
    underGraded,
    falsePositives: findings.filter((finding) => !expected.has(keyOf(finding))),
    accepted: set.accepted,
    score,
  };
}

/*
 * The combined result applies the step-6 rule, an entry counting at the median
 * of the runs' severities; each run is measured alone too, so a weak run shows.
 */
export function scoreRegression({
  locale,
  set,
  runs,
}: {
  locale: string;
  set: RegressionSet;
  runs: { name: string; findings: unknown }[];
}): { combined?: RegressionScore; runs: RegressionScore[]; errors: string[] } {
  const combined = scoreRuns({ locale, catalogs: set.catalogs, runs });

  if (!combined.result) {
    return { runs: [], errors: combined.errors };
  }

  const perRun = runs.map((run) => {
    const { result } = scoreRuns({ locale, catalogs: set.catalogs, runs: [run] });

    return measure(run.name, set, result?.findings ?? [], result?.score ?? 0);
  });

  return {
    combined: measure(
      `${runs.length === 1 ? "1 run" : `${runs.length} runs, agreed`}`,
      set,
      combined.result.findings satisfies AgreedFinding[],
      combined.result.score,
    ),
    runs: perRun,
    errors: [],
  };
}

function ratio({ caught, expected }: Recall) {
  return expected === 0 ? "-" : `${caught}/${expected}`;
}

export function formatRegression(
  locale: string,
  combined: RegressionScore,
  runs: RegressionScore[],
) {
  const rows = [
    [
      "Runs",
      "Critical",
      "Major",
      "Minor",
      "Recall",
      "Without few-shot",
      "Category matches",
      "False positives",
      "Score",
    ],
    ["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:"],
    ...[combined, ...(runs.length > 1 ? runs : [])].map((result) => [
      result.name,
      ratio(result.recall.critical),
      ratio(result.recall.major),
      ratio(result.recall.minor),
      `${ratio(result.total)} (${((100 * result.total.caught) / Math.max(result.total.expected, 1)).toFixed(0)}%)`,
      ratio(result.withoutFewShot),
      `${result.categoryMatches}/${result.total.caught}`,
      `${result.falsePositives.length}/${result.accepted}`,
      result.score.toFixed(2),
    ]),
  ];

  const lines = [`## ${locale}`, "", ...rows.map((cells) => `| ${cells.join(" | ")} |`)];

  const describe = ({ msgctxt, msgid }: { msgctxt: string | null; msgid: string }) =>
    `${msgctxt === null ? "" : `${JSON.stringify(msgctxt)} `}${JSON.stringify(msgid)}`;

  for (const [title, items] of [
    [
      "missed",
      combined.missed.map(
        (expectation) =>
          `- ${describe(expectation)}: expected ${expectation.categories.join("|")} ${expectation.severity}`,
      ),
    ],
    [
      "flagged below the expected severity",
      combined.underGraded.map(
        ({ expectation, finding }) =>
          `- ${describe(expectation)}: expected ${expectation.severity}, agreed ${finding.severity} ${finding.category}`,
      ),
    ],
    [
      "false positives on accepted entries",
      combined.falsePositives.map(
        (finding) =>
          `- ${finding.severity} ${finding.category}: ${describe(finding)} ${JSON.stringify(finding.msgstr)} → ${JSON.stringify(finding.correction)}: ${finding.reason}`,
      ),
    ],
  ] as const) {
    if (items.length > 0) {
      lines.push("", `${locale}, ${title}:`, ...items);
    }
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

export function reviewerCommand(prompt: string, dir: string) {
  return [
    "claude",
    "-p",
    prompt,
    "--agent",
    "translation-mqm-reviewer",
    "--add-dir",
    dir,
    "--allowedTools",
    "Read,Grep,Glob,Write",
  ];
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

async function prepare(locale: string, dir: string) {
  const set = await loadRegressionSet(locale);

  await mkdir(dir, { recursive: true });

  const { text, total } = dumpCatalogs(locale, set.catalogs);

  await Bun.write(path.join(dir, `${locale}.dump.txt`), text);

  const glossary = sliceGlossary(
    await Bun.file(path.join(import.meta.dir, "glossary.md")).text(),
    locale,
  );

  await Bun.write(path.join(dir, `${locale}.glossary.md`), glossary.text);

  console.log(
    `${locale}: ${total} entries, ${set.accepted} accepted and ${set.expectations.length} known-bad, in ${dir}`,
  );

  return Array.from({ length: RUNS }, (_, index) =>
    reviewerCommand(reviewerPrompt(locale, dir, index + 1, glossary.warnings.length > 0), dir),
  );
}

/*
 * The agents' frontmatter sets their model and effort, and these two
 * variables would override it for every run measured.
 */
function reviewerEnv() {
  const env = { ...process.env };

  delete env.CLAUDE_CODE_EFFORT_LEVEL;
  delete env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE;

  return env;
}

async function score(locale: string, dir: string) {
  const { combined, runs, errors } = scoreRegression({
    locale,
    set: await loadRegressionSet(locale),
    runs: await readRuns(dir, locale),
  });

  if (!combined) {
    throw new Error(errors.map((error) => `${locale}: ${error}`).join("\n"));
  }

  console.log(`${formatRegression(locale, combined, runs)}\n`);
}

const USAGE = `Usage: bun .claude/skills/translate/regression.ts prepare --dir <dir> <tag>…
       bun .claude/skills/translate/regression.ts run --dir <dir> <tag>…
       bun .claude/skills/translate/regression.ts score --dir <dir> <tag>…

Measures the step-6 MQM reviewers on regression/<tag>.po.

prepare  writes <dir>/<tag>.dump.txt and <tag>.glossary.md from the set and
         prints the ${RUNS} reviewer commands, one per run, to run from the repository.
run      prepares, runs the ${RUNS} reviewers per locale in parallel, headless,
         each writing <dir>/<tag>.mqm.<run>.json and logging to <tag>.mqm.<run>.log,
         then scores.
score    reports recall per severity, false positives and each run's numbers
         from the findings files in <dir>.`;

async function run() {
  const { values, positionals } = parseArgs({
    options: { dir: { type: "string" }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  });

  const [mode, ...locales] = positionals;

  if (values.help) {
    console.log(USAGE);

    return;
  }

  if (!values.dir || !["prepare", "run", "score"].includes(mode ?? "") || locales.length === 0) {
    console.error(USAGE);

    process.exit(2);
  }

  const dir = path.resolve(values.dir);

  if (mode === "score") {
    for (const locale of locales) {
      await score(locale, dir);
    }

    return;
  }

  const commands = (
    await Promise.all(
      locales.map(async (locale) =>
        (await prepare(locale, dir)).map((command, index) => ({ locale, run: index + 1, command })),
      ),
    )
  ).flat();

  if (mode === "prepare") {
    console.log(
      `\nFrom ${REPOSITORY}:\n\n${commands
        .map(
          ({ command }) =>
            `env -u CLAUDE_CODE_EFFORT_LEVEL -u CLAUDE_CODE_SUBAGENT_MODEL_FORCE ${command.map(shellQuote).join(" ")}`,
        )
        .join("\n\n")}`,
    );

    return;
  }

  const exits = await Promise.all(
    commands.map(async ({ locale, run, command }) => {
      const log = path.join(dir, `${locale}.mqm.${run}.log`);

      const child = Bun.spawn(command, {
        cwd: REPOSITORY,
        env: reviewerEnv(),
        stdout: Bun.file(log),
        stderr: "inherit",
        stdin: "ignore",
      });

      const code = await child.exited;

      console.log(`${locale} run ${run}: exit ${code}, ${log}`);

      return code;
    }),
  );

  if (exits.some((code) => code !== 0)) {
    throw new Error("A reviewer run failed; see its log.");
  }

  for (const locale of locales) {
    await score(locale, dir);
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
