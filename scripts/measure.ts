// pnpm measure [--profile <name>] [--samples <n>] [--idle <seconds>] [--floor[=view]] [--blank]
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { currentBranch, devUserDataDir } from "../packages/user-data/index.ts";
import { measureApp } from "./lib/measure-app.ts";
import { recordingHost, table } from "./lib/measure-summary.ts";
import type { AppName, Measurement } from "./lib/measure-summary.ts";

const root = path.join(import.meta.dirname, "..");
const KEEP = 500;

const args = process.argv.slice(2);
// parseArgs has no option that is a flag alone and takes a value after `=`, which is what --floor and --floor=view are.
const floorArg = args.find(
  (arg) => arg === "--floor" || arg.startsWith("--floor=")
);
const { values } = parseArgs({
  args: args.filter((arg) => arg !== floorArg),
  options: {
    blank: { default: false, type: "boolean" },
    idle: { default: "60", type: "string" },
    profile: { type: "string" },
    samples: { default: "3", type: "string" },
  },
});

const positive = (text: string, name: string) => {
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`--${name} takes a number above zero, not ${text}`);
  }
  return number;
};

const floorOf = (arg: string | undefined): AppName | undefined => {
  if (arg === undefined) {
    return undefined;
  }
  if (arg === "--floor") {
    return "floor";
  }
  if (arg === "--floor=view") {
    return "floor-view";
  }
  throw new Error(`${arg} is not --floor or --floor=view`);
};

/** Appends a line per measurement, keeping the newest lines only, when this is the machine the file records, and says what it did. */
const record = async (measurements: readonly Measurement[]) => {
  const file = path.join(root, "measurements", "darwin.jsonl");
  await mkdir(path.dirname(file), { recursive: true });
  const text = existsSync(file) ? await readFile(file, "utf-8") : "";
  const host = recordingHost(text, process.env.MERU_MEASURE_HOST);
  if (host !== undefined && host !== hostname()) {
    return `Not recorded: ${path.relative(root, file)} records ${host}, and this is ${hostname()}`;
  }
  const lines = text.split("\n").filter(Boolean);
  const added = measurements.map((measurement) => JSON.stringify(measurement));
  const kept = [...lines, ...added].slice(-KEEP);
  await (kept.length === lines.length + added.length
    ? appendFile(file, added.map((line) => `${line}\n`).join(""))
    : writeFile(file, `${kept.join("\n")}\n`));
  return `Appended to ${path.relative(root, file)}`;
};

const run = async () => {
  if (process.platform !== "darwin") {
    throw new Error(
      "pnpm measure runs on macOS only, where the numbers are kept"
    );
  }
  if (!existsSync(path.join(root, "app/dist/main/index.js"))) {
    throw new Error("Nothing to measure in app/dist/; run pnpm build first");
  }
  const floor = floorOf(floorArg);
  const common = {
    blank: values.blank,
    idleSeconds: positive(values.idle, "idle"),
    readings: positive(values.samples, "samples"),
  };
  const meru = await measureApp({
    ...common,
    app: "meru",
    userData:
      values.profile === undefined
        ? undefined
        : devUserDataDir(root, values.profile, currentBranch(root)),
  });
  const base =
    floor === undefined
      ? undefined
      : await measureApp({ ...common, app: floor });
  const outcome = await record(base === undefined ? [meru] : [meru, base]);
  console.log(
    `${meru.commit} on ${meru.platform}, Electron ${meru.electron}, ${meru.blank ? "blank panes" : "panes showing their app"}. Memory is private where Electron reports it, else the working set; CPU is percent of one core.\n`
  );
  console.log(table(meru, base));
  console.log(`\n${outcome}`);
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
