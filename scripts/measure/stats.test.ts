import { describe, expect, it } from "vitest";

import { compareSummaries, summarize } from "./stats.ts";

describe(summarize, () => {
  it("gives each metric's median and range over the runs that took it", () => {
    const summary = summarize([
      { total: 300, "inbox usable ms": 1200 },
      { total: 310 },
      { total: 290, "inbox usable ms": 1000 },
    ]);

    expect(summary.get("total")).toStrictEqual({
      median: 300,
      min: 290,
      max: 310,
      runs: 3,
    });
    expect(summary.get("inbox usable ms")).toStrictEqual({
      median: 1100,
      min: 1000,
      max: 1200,
      runs: 2,
    });
  });
});

describe(compareSummaries, () => {
  const floor = summarize([{ total: 290 }, { total: 300 }, { total: 310 }]);

  it("says a difference larger than both ranges together is beyond the spread", () => {
    const current = summarize([{ total: 400 }, { total: 405 }, { total: 410 }]);

    expect(compareSummaries(current, floor).get("total")).toStrictEqual({
      difference: 105,
      isBeyondSpread: true,
    });
  });

  it("says a difference within the ranges is not", () => {
    const current = summarize([{ total: 300 }, { total: 315 }, { total: 330 }]);

    expect(compareSummaries(current, floor).get("total")).toStrictEqual({
      difference: 15,
      isBeyondSpread: false,
    });
  });

  it("leaves out a metric only one side has", () => {
    const current = summarize([{ total: 300, "renderer: shell": 24 }]);

    expect([...compareSummaries(current, floor).keys()]).toStrictEqual([
      "total",
    ]);
  });
});
