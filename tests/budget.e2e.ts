import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { overBudget } from "../scripts/lib/measure-summary.ts";
import { measureApp } from "./measure.ts";

const IDLE_CPU_PERCENT = 2;
const GROWTH_MB = 10;
const IDLE_SECONDS = 60;
const READINGS = 3;

test("stays within its CPU and memory budget", async () => {
  test.skip(
    process.platform !== "darwin",
    "Measured on macOS only, where the budget was set"
  );
  test.setTimeout((IDLE_SECONDS + 60) * 1000);
  const measurement = await measureApp({
    app: "meru",
    blank: true,
    idleSeconds: IDLE_SECONDS,
    readings: READINGS,
  });
  const file = path.join(
    test.info().project.outputDir,
    "budget",
    "measurement.jsonl"
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(measurement)}\n`);
  expect(
    overBudget(measurement, {
      growthKB: GROWTH_MB * 1024,
      idleCpu: IDLE_CPU_PERCENT,
    })
  ).toStrictEqual([]);
});
