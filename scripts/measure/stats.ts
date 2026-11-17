import { median } from "es-toolkit";

/** One run's figures, by metric name; a metric a run could not take is absent. */
export type Metrics = Record<string, number>;

export interface Summary {
  median: number;
  min: number;
  max: number;
  runs: number;
}

/** Each metric's median and range over the runs that took it. */
export const summarize = (runs: readonly Metrics[]) => {
  const values = new Map<string, number[]>();

  for (const metrics of runs) {
    for (const [name, value] of Object.entries(metrics)) {
      values.set(name, [...(values.get(name) ?? []), value]);
    }
  }

  return new Map<string, Summary>(
    [...values].map(([name, list]) => [
      name,
      {
        median: median(list),
        min: Math.min(...list),
        max: Math.max(...list),
        runs: list.length,
      },
    ])
  );
};

/**
 * Medians of `current` less those of `baseline`, for each metric both have,
 * with whether the difference is larger than the two ranges' widths together,
 * the least that cannot be put down to the spread between runs.
 */
export const compareSummaries = (
  current: ReadonlyMap<string, Summary>,
  baseline: ReadonlyMap<string, Summary>
) =>
  new Map(
    [...current].flatMap(([name, summary]) => {
      const before = baseline.get(name);

      if (!before) {
        return [];
      }

      const difference = summary.median - before.median;
      const noise = summary.max - summary.min + (before.max - before.min);

      return [
        [name, { difference, isBeyondSpread: Math.abs(difference) > noise }],
      ];
    })
  );
