/*
 * Where a performance run's figures go when something outside the run has to
 * read them.
 *
 * They are attached to the Playwright report either way, and that is the right
 * shape for a person: someone opening a run browses to the test and reads its
 * JSON. It is the wrong shape for a program. An attachment is a file under a
 * content-hashed directory in `test-results`, named after the test that wrote
 * it, and subtracting one run from another by digging two of those out is more
 * fragile than naming a path and asking for it.
 *
 * So MERU_PERF_REPORT names one file, and every section of the run merges into
 * it. Unset — which is every run that nothing is going to read afterwards —
 * none of this happens and the attachments are still there.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CycleGrowth, CycleSample, Sample } from "./profile";

export type PerfReport = {
  platform: string;
  /** What was measured, when the runner was told. Absent from a local run. */
  commit?: string;
  coldLaunch?: Sample;
  settingsCycles?: { pages: number; samples: CycleSample[]; growth: CycleGrowth };
  /** Bytes per shipped file, keyed the way a budget names it. Linux only. */
  bundles?: Record<string, number>;
};

type Section = Exclude<keyof PerfReport, "platform" | "commit">;

/**
 * Merges one section into the report file, leaving the others alone.
 *
 * Read-modify-write, which is safe here for the reason the Playwright config
 * gives: the app takes a single instance lock, so the whole suite runs on one
 * worker and no two tests are ever between the read and the write together.
 */
export async function recordSection<Name extends Section>(
  section: Name,
  payload: NonNullable<PerfReport[Name]>,
) {
  const reportPath = process.env.MERU_PERF_REPORT;

  if (!reportPath) {
    return;
  }

  const resolvedPath = path.resolve(reportPath);

  await mkdir(path.dirname(resolvedPath), { recursive: true });

  const existing: Partial<PerfReport> = await readFile(resolvedPath, "utf8")
    .then((contents) => JSON.parse(contents))
    // A first section of a first run has nothing to merge into, and a file left
    // half-written by a killed run is not worth failing a measurement over.
    .catch(() => ({}));

  const report: PerfReport = {
    ...existing,
    platform: process.platform,
    ...(process.env.MERU_PERF_COMMIT ? { commit: process.env.MERU_PERF_COMMIT } : {}),
    [section]: payload,
  };

  await writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`);
}
