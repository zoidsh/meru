import { describe, expect, it } from "vitest";

import { formatComparison, formatScenario, orderMetrics } from "./report.ts";

describe(orderMetrics, () => {
  it("puts memory by process first, then the totals, then the rest", () => {
    expect(
      orderMetrics([
        "idle CPU %",
        "memory total",
        "memory renderer: shell",
        "memory renderer: Gmail",
        "memory helper storage",
        "memory browser",
        "processes",
      ])
    ).toStrictEqual([
      "memory browser",
      "memory renderer: Gmail",
      "memory renderer: shell",
      "memory helper storage",
      "memory total",
      "processes",
      "idle CPU %",
    ]);
  });
});

describe(formatScenario, () => {
  it("shows each target's median and range, its difference from the floor, and a skipped target's reason", () => {
    const table = formatScenario("gmail", [
      {
        target: "v4",
        scenario: "gmail",
        runs: [
          { "memory total": 440 },
          { "memory total": 450 },
          { "memory total": 445 },
        ],
      },
      {
        target: "floor",
        scenario: "gmail",
        runs: [
          { "memory total": 300 },
          { "memory total": 302 },
          { "memory total": 298 },
        ],
      },
      { target: "v3", scenario: "gmail", skipped: "not installed", runs: [] },
    ]);

    expect(table.split("\n")).toStrictEqual([
      "Scenario: gmail",
      "                      v4 (3 runs)       floor (3 runs)  v4 − floor",
      "memory total  445.0 (440.0–450.0)  300.0 (298.0–302.0)      +145.0",
      "v3 skipped: not installed",
    ]);
  });
});

describe(formatComparison, () => {
  it("prints each target and scenario both runs measured, and marks a change within the spread", () => {
    const text = formatComparison(
      [
        {
          target: "v4",
          scenario: "gmail",
          runs: [{ processes: 6 }, { processes: 7 }],
        },
      ],
      [
        { target: "v4", scenario: "gmail", runs: [{ processes: 6 }] },
        { target: "floor", scenario: "gmail", runs: [{ processes: 5 }] },
      ]
    );

    expect(text).toContain("v4, gmail");
    expect(text).toMatch(/processes\s+6\s+7 \(6–7\)\s+\+1 ~/u);
    expect(text).not.toContain("floor");
  });

  it("says so when nothing was measured in both", () => {
    expect(formatComparison([], [])).toBe(
      "No target and scenario was measured in both runs."
    );
  });
});
