import { describe, expect, it } from "vitest";

import {
  kindOf,
  overBudget,
  recordingHost,
  summarise,
  table,
} from "./measure-summary.ts";
import type {
  AppName,
  Measurement,
  Point,
  ProcessReading,
} from "./measure-summary.ts";

const process = (
  name: string,
  type: string,
  cpu: number,
  workingSetKB: number,
  privateKB: number | null = null
): ProcessReading => ({
  cpu,
  idleWakeups: null,
  name,
  pid: name.length * 100 + type.length,
  privateKB,
  sharedKB: null,
  type,
  workingSetKB,
});

const measurement = (
  app: AppName,
  samples: Partial<Record<Point, ProcessReading[][]>>
): Measurement => ({
  app,
  at: "2026-11-12T00:00:00.000Z",
  blank: true,
  commit: "abc1234",
  host: "mac-mini",
  electron: "45.2.3",
  platform: "darwin",
  samples: Object.entries(samples).flatMap(([point, readings]) =>
    point === "launch" || point === "split" || point === "idle"
      ? [{ point, readings }]
      : []
  ),
});

const MB = 1024;

const meru = measurement("meru", {
  idle: [
    [
      process("main", "Browser", 0.4, 150 * MB, 45 * MB),
      process("chrome page", "Tab", 0.2, 60 * MB),
      process("pane mail.google.com", "Tab", 1, 80 * MB),
      process("pane calendar.google.com", "Tab", 2, 90 * MB),
    ],
    [
      process("main", "Browser", 0.6, 150 * MB, 46 * MB),
      process("chrome page", "Tab", 0.4, 61 * MB),
      process("pane mail.google.com", "Tab", 3, 80 * MB),
      process("pane calendar.google.com", "Tab", 2, 90 * MB),
    ],
  ],
  launch: [
    [
      process("main", "Browser", 5, 140 * MB, 40 * MB),
      process("chrome page", "Tab", 3, 50 * MB),
      process("gpu", "GPU", 1, 70 * MB),
    ],
  ],
});

describe(kindOf, () => {
  it("names a process by type, and a renderer by what it shows", () => {
    expect(
      [
        process("main", "Browser", 0, 0),
        process("gpu", "GPU", 0, 0),
        process("Network Service", "Utility", 0, 0),
        process("chrome page", "Tab", 0, 0),
        process("pane mail.google.com, pane mail.google.com", "Tab", 0, 0),
        process("overlay", "Tab", 0, 0),
        process("", "Tab", 0, 0),
      ].map(kindOf)
    ).toStrictEqual([
      "main",
      "gpu",
      "utility",
      "chrome page",
      "pane",
      "overlay",
      "renderer",
    ]);
  });
});

describe(summarise, () => {
  it("takes per kind and point the largest memory and the mean of the summed CPU", () => {
    expect(summarise(meru)).toStrictEqual([
      {
        kind: "main",
        points: {
          idle: { cpu: 0.5, memoryKB: 46 * MB },
          launch: { cpu: 5, memoryKB: 40 * MB },
        },
      },
      {
        kind: "chrome page",
        points: {
          idle: { cpu: 0.30000000000000004, memoryKB: 61 * MB },
          launch: { cpu: 3, memoryKB: 50 * MB },
        },
      },
      { kind: "pane", points: { idle: { cpu: 4, memoryKB: 90 * MB } } },
      { kind: "gpu", points: { launch: { cpu: 1, memoryKB: 70 * MB } } },
    ]);
  });
});

describe(table, () => {
  it("prints Meru's numbers beside the floor's", () => {
    const floor = measurement("floor", {
      launch: [[process("main", "Browser", 1, 100 * MB, 30 * MB)]],
    });
    expect(table(meru, floor).split("\n")).toStrictEqual([
      "kind         launch        launch floor  split  split floor  idle          idle floor",
      "main         40.0 MB 5.0%  30.0 MB 1.0%  -      -            46.0 MB 0.5%  -",
      "chrome page  50.0 MB 3.0%  -             -      -            61.0 MB 0.3%  -",
      "pane         -             -             -      -            90.0 MB 4.0%  -",
      "gpu          70.0 MB 1.0%  -             -      -            -             -",
    ]);
  });

  it("prints Meru alone when there is no floor", () => {
    expect(table(meru).split("\n")[0]).toBe(
      "kind         launch        split  idle"
    );
  });
});

describe(overBudget, () => {
  it("names each process over the idle CPU budget and each kind that grew too much", () => {
    expect(overBudget(meru, { growthKB: 10 * MB, idleCpu: 2 })).toStrictEqual([
      "chrome page grew 11.0 MB from launch to idle",
    ]);
    expect(overBudget(meru, { growthKB: 5 * MB, idleCpu: 1.9 })).toStrictEqual([
      "pane mail.google.com used 2.0% CPU at idle",
      "pane calendar.google.com used 2.0% CPU at idle",
      "main grew 6.0 MB from launch to idle",
      "chrome page grew 11.0 MB from launch to idle",
    ]);
  });

  it("passes a measurement within budget", () => {
    expect(overBudget(meru, { growthKB: 20 * MB, idleCpu: 2 })).toStrictEqual(
      []
    );
  });
});

describe(recordingHost, () => {
  it("is the first line's host, or the override, or none for a new file", () => {
    const text = `${JSON.stringify({ host: "mac-mini" })}\n${JSON.stringify({ host: "other" })}\n`;
    expect(recordingHost(text, undefined)).toBe("mac-mini");
    expect(recordingHost(text, "laptop")).toBe("laptop");
    expect(recordingHost("", undefined)).toBeUndefined();
  });

  it("refuses a first line without a host", () => {
    expect(() => recordingHost("{}\n", undefined)).toThrow("no host");
  });
});
