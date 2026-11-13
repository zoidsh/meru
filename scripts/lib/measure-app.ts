import { mkdtemp, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

import { _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { uniq } from "es-toolkit/array";
import { execaSync } from "execa";
import { z } from "zod";

import { measure as measureChannels } from "../../app/shared/channels/measure.ts";
import { invokeIn, launch, runCommand } from "./app.ts";
import type {
  AppName,
  Measurement,
  ProcessReading,
  Sample,
} from "./measure-summary.ts";

const root = path.join(import.meta.dirname, "..", "..");

export interface MeasureOptions {
  readonly app: AppName;
  /** An existing user data directory, such as a signed-in profile's; a temporary one otherwise. */
  readonly userData?: string;
  /** Panes show about:blank rather than their app. */
  readonly blank: boolean;
  /** Readings per point, one a second. */
  readonly readings: number;
  readonly idleSeconds: number;
}

const SETTLE = 5000;

const rolesSchema = z.record(z.string(), z.string());

// Runs in the app's main process through Playwright, so Meru and the floor are read by the same code.
const read = async (app: ElectronApplication) =>
  await app.evaluate(async ({ app: electronApp, webContents }) => {
    const main = await process.getProcessMemoryInfo();
    return {
      contents: webContents.getAllWebContents().map((contents) => ({
        id: contents.id,
        pid: contents.getOSProcessId(),
      })),
      // Site isolation puts a cross-site frame, such as one Google's sign-in page embeds, in a process of its own that no web contents names.
      frames: webContents
        .getAllWebContents()
        .flatMap((contents) =>
          contents.mainFrame.framesInSubtree.filter(
            (frame) => frame.osProcessId !== contents.getOSProcessId()
          )
        )
        .map((frame) => ({ pid: frame.osProcessId, url: frame.url })),
      floorRoles: JSON.stringify(Reflect.get(globalThis, "floorRoles") ?? {}),
      main: { privateKB: main.private, sharedKB: main.shared },
      metrics: electronApp.getAppMetrics().map((metric) => ({
        cpu: metric.cpu.percentCPUUsage,
        idleWakeups: metric.cpu.idleWakeupsPerSecond ?? null,
        pid: metric.pid,
        privateKB: metric.memory.privateBytes ?? null,
        service: metric.name ?? metric.serviceName ?? "utility",
        type: metric.type,
        workingSetKB: metric.memory.workingSetSize,
      })),
    };
  });

type Snapshot = Awaited<ReturnType<typeof read>>;

const toReadings = (
  snapshot: Snapshot,
  roles: Readonly<Record<string, string>>
): ProcessReading[] =>
  snapshot.metrics.map(({ service, ...metric }) => {
    const shown = snapshot.contents
      .filter((contents) => contents.pid === metric.pid)
      .flatMap((contents) => roles[String(contents.id)] ?? []);
    const framed = uniq(
      snapshot.frames
        .filter((frame) => frame.pid === metric.pid)
        .flatMap((frame) => {
          try {
            return [`pane frame: ${new URL(frame.url).host}`];
          } catch {
            return [];
          }
        })
    );
    const names: Record<string, string> = {
      Browser: "main",
      GPU: "gpu",
      Tab: (shown.length > 0 ? shown : framed).join(", "),
      Utility: service,
    };
    const main = metric.type === "Browser" ? snapshot.main : undefined;
    return {
      ...metric,
      name: names[metric.type] ?? metric.type,
      privateKB: main?.privateKB ?? metric.privateKB,
      sharedKB: main?.sharedKB ?? null,
    };
  });

const rolesOf = async (
  app: ElectronApplication,
  chrome: Page | undefined
): Promise<Record<string, string>> => {
  if (chrome === undefined) {
    const { floorRoles } = await read(app);
    return rolesSchema.parse(JSON.parse(floorRoles));
  }
  const roles = await invokeIn(chrome, measureChannels.roles, {});
  if (!roles.ok) {
    throw new Error(`measure.roles: ${roles.error.message}`);
  }
  return Object.fromEntries(
    roles.value.map(({ contentsId, name }) => [String(contentsId), name])
  );
};

const sample = async (
  app: ElectronApplication,
  chrome: Page | undefined,
  readings: number
) => {
  // Electron's CPU figure covers the time since the previous call, so the first call only starts the clock.
  await read(app);
  const taken: ProcessReading[][] = [];
  for (let index = 0; index < readings; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each reading is a second after the last
    await wait(1000);
    // oxlint-disable-next-line no-await-in-loop -- as above
    const [snapshot, roles] = await Promise.all([
      read(app),
      rolesOf(app, chrome),
    ]);
    taken.push(toReadings(snapshot, roles));
  }
  return taken;
};

const launchFloor = async (view: boolean) => {
  const userData = await mkdtemp(path.join(tmpdir(), "meru-floor-"));
  const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await electron.launch({
    args: [
      path.join(root, "scripts/floor/main.cjs"),
      ...(view ? ["--floor-view"] : []),
      `--user-data-dir=${userData}`,
      ...sandbox,
    ],
    env: { ...process.env, MERU_TEST_BACKGROUND: "1" },
  });
  return {
    app,
    chrome: undefined,
    close: async () => {
      await app.close();
      await rm(userData, { force: true, recursive: true });
    },
  };
};

const git = (...args: string[]) => execaSync("git", args, { cwd: root }).stdout;

const commit = () =>
  `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain", "--", ".", ":!measurements") === "" ? "" : "+dirty"}`;

/** Launches an app, reads it 5s after launch, right after one split, and after the idle time, and closes it. */
export const measureApp = async (
  options: MeasureOptions
): Promise<Measurement> => {
  const launched =
    options.app === "meru"
      ? await launch({
          env: { MERU_E2E: options.blank ? "1" : "0", MERU_MEASURE: "1" },
          userData: options.userData,
        })
      : await launchFloor(options.app === "floor-view");
  const { app, chrome, close } = launched;
  try {
    await wait(SETTLE);
    const samples: Sample[] = [
      {
        point: "launch",
        readings: await sample(app, chrome, options.readings),
      },
    ];
    if (chrome !== undefined) {
      await runCommand(chrome, "stage.splitVertical");
    }
    samples.push({
      point: "split",
      readings: await sample(app, chrome, options.readings),
    });
    await wait(options.idleSeconds * 1000);
    samples.push({
      point: "idle",
      readings: await sample(app, chrome, options.readings),
    });
    return {
      app: options.app,
      at: new Date().toISOString(),
      blank: options.app !== "meru" || options.blank,
      commit: commit(),
      electron: await app.evaluate(() => process.versions.electron),
      host: hostname(),
      platform: process.platform,
      samples,
    };
  } finally {
    await close();
  }
};
