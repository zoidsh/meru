/*
 * Turns two performance reports into the table someone reads on a pull request.
 *
 * The pair it compares is the base commit and the head commit, built and
 * measured back to back on one runner inside one job. That ordering is the
 * whole design: every absolute figure the profiler takes belongs to the machine
 * that took it — the same commit reads 549 MB on a hosted Windows runner and
 * 772 MB on a hosted Linux one — so a number is only worth showing next to
 * another number the same machine produced minutes earlier.
 *
 * It is also why the base app is measured by *this* checkout's harness rather
 * than by its own. The base commit does not have this file, or the report
 * writer, or whatever the pull request changed in `tests/lib/profile.ts`; a
 * comparison where the measuring instrument differs between the two readings is
 * not a comparison. CI therefore builds the base app, checks head back out, and
 * points the head harness at the base binary.
 *
 * Nothing here fails anything. A delta over the flag threshold gets a marker so
 * it is seen, and that is the end of what this is allowed to do.
 *
 *   bun run scripts/perf-compare.ts perf-reports
 *
 * where the directory holds `base.json` and `head.json`, or holds one
 * subdirectory per platform that does.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PerfReport } from "../tests/lib/report";

/**
 * How far a figure has to move before it is marked, as a proportion and as an
 * absolute amount.
 *
 * Both, for the reason the bundle budgets give about their own slack warning: a
 * proportion alone marks every small figure in the table, because five percent
 * of a three kilobyte counter is noise that any run produces. The floor is what
 * keeps the marker on figures large enough for a move to mean something.
 *
 * The proportion is set where it is because nobody yet knows what a hosted
 * runner's own spread between two runs of the same commit is — one run per
 * platform is what exists. Five percent of the smallest total in that first
 * baseline is 27 MB, which is far more than the one percent three local runs
 * agreed to. Tighten it when a runner has said what it does at rest.
 */
const FLAG_RATIO = 0.05;

const MEMORY_FLOOR_KB = 256;

const BUNDLE_FLOOR_BYTES = 4 * 1024;

const FLAG = "⚠️";

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  linux: "Linux",
  win32: "Windows",
};

/** The order the baseline table in the design doc uses, so the two read alike. */
const PLATFORM_ORDER = ["darwin", "linux", "win32"];

/**
 * What makes the comment findable again on the next push, so that a pull
 * request with twenty commits carries one report rather than twenty.
 */
export const MARKER = "<!-- meru-perf-report -->";

export type Comparison = {
  platform: string;
  /** Absent when the base could not be measured, which leaves the head figures worth showing on their own. */
  base: PerfReport | undefined;
  head: PerfReport;
};

function formatKb(kilobytes: number) {
  return Math.abs(kilobytes) >= 1024
    ? `${(kilobytes / 1024).toFixed(1)} MB`
    : `${Math.round(kilobytes)} KB`;
}

function formatBytes(bytes: number) {
  return formatKb(bytes / 1024);
}

function formatSeconds(seconds: number) {
  return `${seconds.toFixed(2)} s`;
}

function formatMilliseconds(milliseconds: number) {
  return `${Math.round(milliseconds)} ms`;
}

function formatCount(count: number) {
  return String(Math.round(count));
}

function formatSigned(value: number, format: (magnitude: number) => string) {
  // Unsigned at zero. "+0" is the sort of thing a reader stops on to work out
  // what it is trying to say, and it is trying to say nothing moved.
  if (value === 0) {
    return format(0);
  }

  return `${value < 0 ? "-" : "+"}${format(Math.abs(value))}`;
}

function total<Item>(items: Item[] | undefined, read: (item: Item) => number) {
  return items?.reduce((sum, item) => sum + read(item), 0);
}

/*
 * The app's own pages and the web content it hosts, summed apart rather than
 * together.
 *
 * They are close enough in size to hide each other — Meru's renderer reads
 * 5.2 MB of JavaScript heap against a signed-out Gmail view's 5.0 MB — so one
 * total means a change of ours reads at half its size. The halves also differ
 * in what they are worth reading: measured over three CI runs, the sign-in
 * page reported 663 nodes in fifteen samples out of eighteen, while Meru's own
 * renderer came back with either 250 or 78. Whichever of those two is a bug, it
 * is not one a summed row would ever have shown.
 */
function appRenderers(report: PerfReport) {
  return report.coldLaunch?.renderers.filter((renderer) => renderer.isAppPage);
}

function webRenderers(report: PerfReport) {
  return report.coldLaunch?.renderers.filter((renderer) => !renderer.isAppPage);
}

type Figure = {
  label: string;
  read: (report: PerfReport) => number | undefined;
  format: (value: number) => string;
  /**
   * Set for figures that are sampled, and left off for figures that are
   * counted. A process count moving from six to seven is a whole fact on its
   * own, and putting "+16.7%" next to it says nothing a reader wanted.
   */
  proportional?: true;
  /**
   * How far the figure has to move in absolute terms before the marker is
   * allowed, on top of the proportion. Left off for a row that is reported and
   * never marked however far it moves.
   */
  floor?: number;
};

const SUMMARY_FIGURES: Figure[] = [
  {
    label: "Total working set",
    read: (report) => report.coldLaunch?.totalWorkingSetKb,
    format: formatKb,
    proportional: true,
    floor: MEMORY_FLOOR_KB,
  },
  {
    /*
     * Reported without a marker, for the reason the row below it carries.
     *
     * Measured rather than assumed: the first run of this comparison built one
     * commit twice and read -14.2% on macOS, +4.8% on Linux and -3.4% on
     * Windows for two launches of an identical binary. A threshold quiet enough
     * to sit above a fifteen percent swing is so loose that only a doubling
     * would reach it, and a doubling is perfectly legible in the number itself.
     */
    label: "Total CPU to idle",
    read: (report) => report.coldLaunch?.totalCpuSeconds,
    format: formatSeconds,
    proportional: true,
  },
  {
    // Never marked either, and for the plainer version of the same reason. It is
    // a reading on how loaded the runner was as much as on the app, which is
    // why the profiler reports it at all — a run that took three times as long
    // to go quiet is one whose other figures deserve a second look, rather than
    // a regression in itself.
    label: "Settled after",
    read: (report) => report.coldLaunch?.settleMs,
    format: formatMilliseconds,
  },
  {
    label: "Processes",
    read: (report) => report.coldLaunch?.processCount,
    format: formatCount,
  },
  {
    label: "Main JS heap",
    read: (report) => report.coldLaunch?.main.usedHeapKb,
    format: formatKb,
    proportional: true,
    floor: MEMORY_FLOOR_KB,
  },
  {
    label: "Main private",
    read: (report) => report.coldLaunch?.main.privateKb,
    format: formatKb,
    proportional: true,
    floor: MEMORY_FLOOR_KB,
  },
  {
    label: "Meru renderer JS heap",
    read: (report) => total(appRenderers(report), (renderer) => renderer.usedHeapKb),
    format: formatKb,
    proportional: true,
    floor: MEMORY_FLOOR_KB,
  },
  {
    label: "Meru renderer Blink heap",
    read: (report) => total(appRenderers(report), (renderer) => renderer.embedderHeapKb),
    format: formatKb,
    proportional: true,
    floor: MEMORY_FLOOR_KB,
  },
  {
    label: "Meru renderer DOM nodes",
    read: (report) => total(appRenderers(report), (renderer) => renderer.nodes),
    format: formatCount,
  },
  {
    label: "Meru renderer listeners",
    read: (report) => total(appRenderers(report), (renderer) => renderer.jsEventListeners),
    format: formatCount,
  },
  {
    // Both heaps and neither count. A Gmail view's nodes and listeners are
    // Google's markup, which changes when Google changes it and never because
    // of anything in this repository. The heaps are here because one thing in
    // this repository does reach them: the Gmail preload, which finding 1.4 is
    // about, evaluates on that page before its hostname check bails out.
    label: "Account views JS heap",
    read: (report) => total(webRenderers(report), (renderer) => renderer.usedHeapKb),
    format: formatKb,
    proportional: true,
    floor: MEMORY_FLOOR_KB,
  },
  {
    label: "Account views Blink heap",
    read: (report) => total(webRenderers(report), (renderer) => renderer.embedderHeapKb),
    format: formatKb,
    proportional: true,
    floor: MEMORY_FLOOR_KB,
  },
  {
    label: "Shipped bytes",
    read: (report) =>
      report.bundles === undefined
        ? undefined
        : total(Object.values(report.bundles), (size) => size),
    format: formatBytes,
    proportional: true,
    floor: BUNDLE_FLOOR_BYTES,
  },
];

/** Growth within the head run, which has no base to be compared against. */
const LEAK_FIGURES: { label: string; read: (report: PerfReport) => string | undefined }[] = [
  {
    label: "Leak growth, nodes / listeners",
    read: (report) => {
      const growth = report.settingsCycles?.growth;

      return (
        growth &&
        `${formatSigned(growth.nodes, formatCount)} / ${formatSigned(growth.listeners, formatCount)}`
      );
    },
  },
  {
    label: "Leak growth, renderer JS heap",
    read: (report) => {
      const growth = report.settingsCycles?.growth;

      return growth && formatSigned(growth.rendererHeapKb, formatKb);
    },
  },
];

/**
 * One figure as it appears in a cell: what it reads now, and how far it moved.
 *
 * A delta of nothing is left out rather than printed as `(+0)`. Most of this
 * table is unmoved on most pull requests, and a column of zeroes is what stops
 * anyone reading the one row that did move.
 */
function summaryCell(figure: Figure, comparison: Comparison) {
  const head = figure.read(comparison.head);

  if (head === undefined) {
    return "—";
  }

  const base = comparison.base && figure.read(comparison.base);

  if (base === undefined || base === head) {
    return figure.format(head);
  }

  const delta = head - base;

  if (!figure.proportional || base === 0) {
    return `${figure.format(head)} (${formatSigned(delta, figure.format)})`;
  }

  const ratio = delta / base;

  const flagged =
    figure.floor !== undefined && Math.abs(ratio) > FLAG_RATIO && Math.abs(delta) >= figure.floor;

  const percentage = formatSigned(ratio * 100, (value) => value.toFixed(1));

  return `${figure.format(head)} (${percentage}%)${flagged ? ` ${FLAG}` : ""}`;
}

function renderRow(cells: string[]) {
  return `| ${cells.join(" | ")} |`;
}

function renderSummary(comparisons: Comparison[]) {
  const header = ["", ...comparisons.map(({ platform }) => PLATFORM_NAMES[platform] ?? platform)];

  const lines = [
    renderRow(header),
    renderRow(header.map(() => "---")),
    ...SUMMARY_FIGURES.map((figure) =>
      renderRow([
        figure.label,
        ...comparisons.map((comparison) => summaryCell(figure, comparison)),
      ]),
    ),
    ...LEAK_FIGURES.map((figure) =>
      renderRow([
        figure.label,
        ...comparisons.map((comparison) => figure.read(comparison.head) ?? "—"),
      ]),
    ),
  ];

  return lines.join("\n");
}

/**
 * A figure in a detail table, where the two sides are shown separately rather
 * than folded into one cell.
 *
 * A process or a file present on one side only is the news in these tables —
 * a renderer that stopped being created, a chunk that appeared — so it is named
 * as such instead of being dropped or compared against zero.
 */
function detailCells(
  base: number | undefined,
  head: number | undefined,
  format: (value: number) => string,
) {
  if (head === undefined) {
    return [`~~${base === undefined ? "" : format(base)}~~`, "gone"];
  }

  if (base === undefined) {
    return [format(head), "new"];
  }

  return [format(head), base === head ? "" : formatSigned(head - base, format)];
}

function byLabel<Item extends { label: string }>(items: Item[] | undefined) {
  return new Map((items ?? []).map((item) => [item.label, item]));
}

/** Every key either side has, so nothing is invisible for having disappeared. */
function unionOfKeys(left: Iterable<string>, right: Iterable<string>) {
  return [...new Set([...left, ...right])].sort((one, other) => one.localeCompare(other));
}

function renderProcesses(comparison: Comparison) {
  const base = byLabel(comparison.base?.coldLaunch?.processes);

  const head = byLabel(comparison.head.coldLaunch?.processes);

  const header = ["Process", "Working set", "Δ", "CPU", "Δ", "Wakeups/s"];

  return [
    renderRow(header),
    renderRow(header.map(() => "---")),
    ...unionOfKeys(base.keys(), head.keys()).map((label) =>
      renderRow([
        label,
        ...detailCells(base.get(label)?.workingSetKb, head.get(label)?.workingSetKb, formatKb),
        ...detailCells(base.get(label)?.cpuSeconds, head.get(label)?.cpuSeconds, formatSeconds),
        // Always zero on Windows, which Electron does not report and this does
        // not pretend to have.
        formatCount(head.get(label)?.idleWakeupsPerSecond ?? 0),
      ]),
    ),
  ].join("\n");
}

function renderRenderers(comparison: Comparison) {
  const base = byLabel(comparison.base?.coldLaunch?.renderers);

  const head = byLabel(comparison.head.coldLaunch?.renderers);

  const header = ["Renderer", "JS heap", "Δ", "Blink heap", "Δ", "Nodes", "Δ", "Listeners", "Δ"];

  return [
    renderRow(header),
    renderRow(header.map(() => "---")),
    ...unionOfKeys(base.keys(), head.keys()).map((label) =>
      renderRow([
        label,
        ...detailCells(base.get(label)?.usedHeapKb, head.get(label)?.usedHeapKb, formatKb),
        ...detailCells(base.get(label)?.embedderHeapKb, head.get(label)?.embedderHeapKb, formatKb),
        ...detailCells(base.get(label)?.nodes, head.get(label)?.nodes, formatCount),
        ...detailCells(
          base.get(label)?.jsEventListeners,
          head.get(label)?.jsEventListeners,
          formatCount,
        ),
      ]),
    ),
  ].join("\n");
}

/**
 * Only the files whose size moved.
 *
 * The build ships around thirty-five files and a pull request touches two of
 * them, so listing all of them would bury the pair that changed under the
 * thirty that did not. The budget check in `tests/bundles.perf.ts` is what
 * covers the rest, and it names every file it measured in the job log.
 */
function renderBundles(comparison: Comparison) {
  const base = comparison.base?.bundles;

  const head = comparison.head.bundles;

  if (!head) {
    return undefined;
  }

  const changed = unionOfKeys(Object.keys(base ?? {}), Object.keys(head)).filter(
    (bundle) => base?.[bundle] !== head[bundle],
  );

  if (changed.length === 0) {
    return "Every shipped file is byte-identical.";
  }

  const header = ["File", "Size", "Δ"];

  return [
    renderRow(header),
    renderRow(header.map(() => "---")),
    ...changed.map((bundle) =>
      renderRow([`\`${bundle}\``, ...detailCells(base?.[bundle], head[bundle], formatBytes)]),
    ),
  ].join("\n");
}

function renderDetails(comparison: Comparison) {
  const platform = PLATFORM_NAMES[comparison.platform] ?? comparison.platform;

  const bundles = renderBundles(comparison);

  return [
    "<details>",
    `<summary>${platform} in detail</summary>`,
    "",
    renderProcesses(comparison),
    "",
    renderRenderers(comparison),
    ...(bundles ? ["", bundles] : []),
    "",
    "</details>",
  ].join("\n");
}

function shortCommit(commit: string | undefined) {
  return commit ? `\`${commit.slice(0, 7)}\`` : "the base commit";
}

export function renderComparison(comparisons: Comparison[]) {
  const ordered = [...comparisons].sort(
    (one, other) => PLATFORM_ORDER.indexOf(one.platform) - PLATFORM_ORDER.indexOf(other.platform),
  );

  const base = ordered.find(({ base: report }) => report?.commit)?.base;

  return [
    MARKER,
    `### Performance against ${shortCommit(base?.commit)}`,
    "",
    "Both commits were built and measured back to back on the same runner, in the same job. That is what makes the delta mean something: the figures themselves belong to the machine that produced them and are not comparable to any other run.",
    "",
    renderSummary(ordered),
    "",
    `${FLAG} marks a sampled figure that moved by more than ${FLAG_RATIO * 100}%. CPU to idle and settle time carry no marker: both read how loaded the runner was as much as what the app did, and two launches of one binary have come out fifteen percent apart on CPU. Nothing here fails the job.`,
    "",
    "The leak rows are growth *within* the head run, across repeated passes over the settings pages. They have no base to compare against because they already compare a run to itself, which is why that check is the part of this that can fail.",
    "",
    ...ordered.map(renderDetails),
  ].join("\n");
}

async function readReport(reportPath: string) {
  try {
    return JSON.parse(await readFile(reportPath, "utf8")) as PerfReport;
  } catch {
    return undefined;
  }
}

/**
 * Where the report pairs are.
 *
 * A matrix leg has one directory holding both files. The job that posts the
 * comment downloads one artifact per platform, which lands them one directory
 * deeper, so a directory with no `head.json` of its own is looked into rather
 * than reported as empty.
 */
async function collectReportDirectories(root: string) {
  if (await readReport(path.join(root, "head.json"))) {
    return [root];
  }

  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

  const directories: string[] = [];

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const directory = path.join(root, entry.name);

    if (await readReport(path.join(directory, "head.json"))) {
      directories.push(directory);
    }
  }

  return directories;
}

export async function readComparisons(roots: string[]): Promise<Comparison[]> {
  const comparisons: Comparison[] = [];

  for (const root of roots) {
    for (const directory of await collectReportDirectories(root)) {
      const head = await readReport(path.join(directory, "head.json"));

      if (head) {
        comparisons.push({
          platform: head.platform,
          base: await readReport(path.join(directory, "base.json")),
          head,
        });
      }
    }
  }

  return comparisons;
}

if (import.meta.main) {
  const roots = Bun.argv.slice(2);

  if (roots.length === 0) {
    throw new Error(
      "Name at least one directory holding base.json and head.json, as in `bun run scripts/perf-compare.ts perf-reports`.",
    );
  }

  const comparisons = await readComparisons(roots);

  // Not an error. A run with nothing to compare is the ordinary outcome on a
  // push to main, or on a pull request whose diff never touched the app.
  console.log(
    comparisons.length === 0
      ? `No performance reports were found in ${roots.join(", ")}.`
      : renderComparison(comparisons),
  );
}
