import path from "node:path";
import { parseArgs } from "node:util";
import { getConfig } from "@lingui/conf";
import { visibleText } from "./check";
import { type Catalog, catalogFiles, parse } from "./collect";

/*
 * Scores a locale's MQM review, `<dir>/<tag>.mqm.json`, so no agent does the
 * arithmetic. Each error costs its severity's points, the score is
 * 100 × (1 − points / source words), and the gate fails on any critical or
 * major error, and in a full run on a score under 99 too: over the few words of
 * a partial run a score means little. A finding the orchestrator dismissed, with
 * its reason, counts toward neither and is listed instead.
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

export type AssessedEntry = { catalog: string; msgctxt: string | null; msgid: string };

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

function keyOf({ catalog, msgctxt, msgid }: AssessedEntry) {
  return `${catalog}\u0004${msgctxt ?? ""}\u0004${msgid}`;
}

function describe({ catalog, msgctxt, msgid }: AssessedEntry) {
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

  const counts: Record<MqmSeverity, number> = { critical: 0, major: 0, minor: 0 };

  for (const finding of scored) {
    counts[finding.severity]++;
  }

  const words = assessed.reduce((total, { msgid }) => total + countWords(msgid), 0);

  const penalty = SEVERITIES.reduce(
    (total, severity) => total + counts[severity] * PENALTY[severity],
    0,
  );

  const ratio = words === 0 ? 0 : penalty / words;

  const score = 100 * (1 - ratio);

  const partial = entries !== undefined;

  return {
    result: {
      locale,
      partial,
      entries: assessed.length,
      words,
      counts,
      penalty,
      score,
      perThousand: 1000 * ratio,
      passes: counts.critical === 0 && counts.major === 0 && (partial || score >= PASSING_SCORE),
      findings: scored,
      dismissed,
      warnings,
    },
    errors,
  };
}

export function formatTable(results: MqmResult[]) {
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
      "Gate",
    ],
    ["---", "---", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---"],
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
      result.passes ? "pass" : "FAIL",
    ]),
  ];

  return rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

function formatFindings(result: MqmResult) {
  const lines: string[] = [];

  const blocking = result.findings.filter(({ severity }) => severity !== "minor");

  const terms = result.findings.filter(({ source }) => source !== undefined);

  for (const [title, findings] of [
    ["critical and major, to fix and score again", blocking],
    ["term-level, to settle in the sidecar", terms],
    ["dismissed, left out of the score", result.dismissed],
  ] as const) {
    if (findings.length === 0) {
      continue;
    }

    lines.push(`${result.locale}, ${title}:`);

    for (const finding of findings) {
      lines.push(
        `- ${finding.severity} ${finding.category}${finding.unsure ? " (unsure)" : ""}: ${describe(finding)} ${JSON.stringify(finding.msgstr)} → ${JSON.stringify(finding.correction)}${finding.source ? ` [${finding.source}]` : ""}${finding.dismissed ? `\n  dismissed: ${finding.dismissed}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

const USAGE = `Usage: bun .claude/skills/translate/mqm.ts --dir <dir> [--partial] <tag>…

Scores each locale's MQM findings, <dir>/<tag>.mqm.json, against its catalogs.
A full run assesses every live entry of both catalogs; with --partial, only the
entries collect.ts listed in <dir>/<tag>.txt.

Exit codes: 0 every locale passes, 1 a locale fails the gate, 2 the input is invalid.`;

async function run() {
  const { values, positionals } = parseArgs({
    options: {
      dir: { type: "string" },
      partial: { type: "boolean" },
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

  const results: MqmResult[] = [];

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

    const entries = values.partial
      ? parseEntryFile(await Bun.file(path.join(values.dir, `${locale}.txt`)).text())
      : undefined;

    const scored = scoreLocale({
      locale,
      catalogs,
      findings: await Bun.file(path.join(values.dir, `${locale}.mqm.json`)).json(),
      entries,
    });

    errors.push(...scored.errors.map((error) => `${locale}: ${error}`));

    if (scored.result) {
      results.push(scored.result);
    }
  }

  if (errors.length > 0) {
    console.error(errors.join("\n"));

    process.exit(2);
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
