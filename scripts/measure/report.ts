import { compareSummaries, summarize } from "./stats.ts";
import type { Metrics, Summary } from "./stats.ts";

export interface TargetResult {
  target: string;
  scenario: string;
  /** Why the target did not run the scenario, when it did not. */
  skipped?: string;
  runs: Metrics[];
}

const FLOOR = "floor";

const ORDER = [
  "memory browser",
  "memory GPU",
  "memory network",
  "memory renderer",
  "memory helper",
  "memory total",
  "memory total, shared once",
  "processes",
  "window shown ms",
  "inbox usable ms",
  "idle CPU %",
  "app size MB",
];

const rank = (name: string) => {
  const index = ORDER.findIndex(
    (prefix) =>
      name === prefix ||
      name.startsWith(`${prefix}:`) ||
      name.startsWith(`${prefix} `)
  );

  return index === -1 ? ORDER.length : index;
};

/** Metrics in reading order: memory by process, totals, then the rest. */
export const orderMetrics = (names: Iterable<string>) =>
  [...new Set(names)].toSorted(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b)
  );

const decimalsFor = (name: string) =>
  name.endsWith(" ms") || name === "processes" ? 0 : 1;

const formatValue = (name: string, value: number) =>
  value.toFixed(decimalsFor(name));

const formatSummary = (name: string, summary: Summary | undefined) => {
  if (!summary) {
    return "–";
  }

  const middle = formatValue(name, summary.median);

  return summary.runs > 1 && summary.min !== summary.max
    ? `${middle} (${formatValue(name, summary.min)}–${formatValue(name, summary.max)})`
    : middle;
};

const formatDifference = (
  name: string,
  difference: { difference: number; isBeyondSpread: boolean } | undefined
) => {
  if (!difference) {
    return "–";
  }

  const sign = difference.difference >= 0 ? "+" : "";
  // A difference no larger than the two ranges together is marked as noise.
  const mark = difference.isBeyondSpread ? "" : " ~";

  return `${sign}${formatValue(name, difference.difference)}${mark}`;
};

const renderTable = (rows: string[][]) => {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0))
  );

  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === 0
            ? cell.padEnd(widths?.[column] ?? 0)
            : cell.padStart(widths?.[column] ?? 0)
        )
        .join("  ")
        .trimEnd()
    )
    .join("\n");
};

/**
 * One table for a scenario: each target's median and range, and each
 * target's difference from the floor where the floor ran it.
 */
export const formatScenario = (
  scenario: string,
  results: readonly TargetResult[]
) => {
  const ran = results.filter((result) => !result.skipped);
  const summaries = new Map(
    ran.map((result) => [result.target, summarize(result.runs)])
  );
  const floor = summaries.get(FLOOR);
  const others = ran.filter((result) => result.target !== FLOOR);
  const differences = new Map(
    floor
      ? others.map((result) => [
          result.target,
          compareSummaries(summaries.get(result.target) ?? new Map(), floor),
        ])
      : []
  );
  const names = orderMetrics(
    [...summaries.values()].flatMap((summary) => [...summary.keys()])
  );
  const header = [
    "",
    ...ran.map(
      (result) => `${result.target} (${String(result.runs.length)} runs)`
    ),
    ...[...differences.keys()].map((target) => `${target} − floor`),
  ];
  const rows = names.map((name) => [
    name,
    ...ran.map((result) =>
      formatSummary(name, summaries.get(result.target)?.get(name))
    ),
    ...[...differences.values()].map((difference) =>
      formatDifference(name, difference.get(name))
    ),
  ]);
  const skipped = results
    .filter((result) => result.skipped)
    .map((result) => `${result.target} skipped: ${result.skipped ?? ""}`);

  return [
    `Scenario: ${scenario}`,
    ran.length > 0 ? renderTable([header, ...rows]) : "Nothing ran.",
    ...skipped,
  ].join("\n");
};

/** Each target and scenario both runs measured, now against then. */
export const formatComparison = (
  current: readonly TargetResult[],
  earlier: readonly TargetResult[]
) => {
  const sections = current.flatMap((result) => {
    const before = earlier.find(
      (candidate) =>
        candidate.target === result.target &&
        candidate.scenario === result.scenario &&
        !candidate.skipped
    );

    if (result.skipped || !before) {
      return [];
    }

    const now = summarize(result.runs);
    const then = summarize(before.runs);
    const differences = compareSummaries(now, then);
    const rows = orderMetrics(now.keys()).map((name) => [
      name,
      formatSummary(name, then.get(name)),
      formatSummary(name, now.get(name)),
      formatDifference(name, differences.get(name)),
    ]);

    return [
      `${result.target}, ${result.scenario}\n${renderTable([["", "earlier", "now", "difference"], ...rows])}`,
    ];
  });

  return sections.length > 0
    ? sections.join("\n\n")
    : "No target and scenario was measured in both runs.";
};
