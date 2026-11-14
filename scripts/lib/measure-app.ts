import { mkdtemp, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

import { _electron as electron, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { uniq } from "es-toolkit/array";
import { execaSync } from "execa";
import { z } from "zod";

import {
  MEASURE_GLOBAL,
  measureRolesSchema,
} from "../../app/main/shell/measure.ts";
import { launcher } from "../../app/shared/channels/launcher.ts";
import { profiles } from "../../app/shared/channels/profiles.ts";
import { stage } from "../../app/shared/channels/stage.ts";
import {
  invokeIn,
  launch,
  pageOf,
  readExposed,
  runCommand,
  sendIn,
  valueOf,
} from "./app.ts";
import type {
  AppName,
  Measurement,
  Point,
  ProcessReading,
  Sample,
} from "./measure-summary.ts";

const root = path.join(import.meta.dirname, "..", "..");

interface MeasureOptions {
  readonly app: AppName;
  /** An existing user data directory, such as a signed-in profile's; a temporary one otherwise. */
  readonly userData?: string;
  /** Panes show about:blank rather than their app. */
  readonly blank: boolean;
  /** Readings per point, one a second. */
  readonly readings: number;
  readonly idleSeconds: number;
}

/** What each web contents shows, by its id. */
type Roles = Readonly<Record<string, string>>;

/** A launched app, what its web contents show, and what it does between points; the floor does nothing. */
interface Target {
  readonly app: ElectronApplication;
  readonly roles: () => Promise<Roles>;
  readonly split: () => Promise<void>;
  /** Starts a drag and answers its release. */
  readonly drag: () => Promise<() => Promise<void>>;
  readonly openLauncher: () => Promise<void>;
  readonly closeLauncher: () => Promise<void>;
  readonly close: () => Promise<void>;
}

const SETTLE = 5000;

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

const toReadings = (snapshot: Snapshot, roles: Roles): ProcessReading[] =>
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

// Electron's CPU figure covers the time since the previous call to getAppMetrics, so `read` is the only caller while sampling: a second read between two would leave the next one a figure over almost no time.
const sample = async (target: Target, readings: number) => {
  await read(target.app);
  const taken: ProcessReading[][] = [];
  for (let index = 0; index < readings; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each reading is a second after the last
    await wait(1000);
    // oxlint-disable-next-line no-await-in-loop -- as above
    const [snapshot, roles] = await Promise.all([
      read(target.app),
      target.roles(),
    ]);
    taken.push(toReadings(snapshot, roles));
  }
  return taken;
};

const floorRolesSchema = z.record(z.string(), z.string());

const readFloorRoles = async (app: ElectronApplication): Promise<Roles> =>
  floorRolesSchema.parse(
    JSON.parse(
      await app.evaluate(() =>
        JSON.stringify(Reflect.get(globalThis, "floorRoles") ?? {})
      )
    )
  );

const nothing = async () => {
  // The floor has no split, drag or launcher.
};

const launchFloor = async (view: boolean): Promise<Target> => {
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
  // The floor names its web contents once its pages have loaded, and never changes them.
  await expect
    .poll(async () => Object.keys(await readFloorRoles(app)).length)
    .toBeGreaterThan(0);
  const roles = await readFloorRoles(app);
  return {
    app,
    close: async () => {
      await app.close();
      await rm(userData, { force: true, recursive: true });
    },
    closeLauncher: nothing,
    drag: async () => await Promise.resolve(nothing),
    openLauncher: nothing,
    roles: async () => await Promise.resolve(roles),
    split: nothing,
  };
};

// A split command opens the launcher for the new pane's app, so the split is asked for as the launcher asks it, with an app other than Gmail, whose one tab a split would only bring to the front.
const splitWithCalendar = async (chrome: Page) => {
  const { selectedProfileId } = valueOf(
    await invokeIn(chrome, profiles.snapshot, {})
  );
  await invokeIn(chrome, stage.openTab, {
    appId: "calendar",
    profileId: selectedProfileId,
    split: "vertical",
  });
};

const DRAG_STEP = 16;

// The new tab is dragged as the sidebar hands a row's drag to the stage, its pointer swept back and forth across the window as a hand would, so the drag's page and the drop marks are paid for while it is read.
const dragCalendar = async (chrome: Page) => {
  const { tabs } = valueOf(await invokeIn(chrome, profiles.snapshot, {}));
  const tab = tabs.find((found) => found.appId === "calendar");
  if (tab === undefined) {
    throw new Error("The split left no Calendar tab to drag");
  }
  await sendIn(chrome, stage.beginDrag, { kind: "tab", tabId: tab.id });
  const controller = new AbortController();
  const sweep = async () => {
    for (let step = 0; !controller.signal.aborted; step += 1) {
      const phase = (step % 100) / 100;
      // oxlint-disable-next-line no-await-in-loop -- one move a frame, as a pointer sends them
      await sendIn(chrome, stage.dragTo, {
        buttons: 1,
        x: Math.round(100 + 800 * Math.abs(1 - 2 * phase)),
        y: 300,
      });
      // oxlint-disable-next-line no-await-in-loop -- as above
      await wait(DRAG_STEP);
    }
  };
  const swept = sweep();
  return async () => {
    controller.abort();
    await swept;
    await sendIn(chrome, stage.cancelDrag, {});
  };
};

const launchMeru = async (options: MeasureOptions): Promise<Target> => {
  const { app, chrome, close } = await launch({
    env: { MERU_E2E: options.blank ? "1" : "0", MERU_MEASURE: "1" },
    userData: options.userData,
  });
  return {
    app,
    close,
    closeLauncher: async () => {
      await sendIn(chrome, launcher.close, {});
    },
    drag: async () => await dragCalendar(chrome),
    openLauncher: async () => {
      await runCommand(chrome, "launcher.open");
      const page = await pageOf(app, "kind=launcher");
      await page.locator("input").waitFor();
    },
    roles: async () => {
      const roles = measureRolesSchema.parse(
        await readExposed(app, MEASURE_GLOBAL)
      );
      return Object.fromEntries(
        roles.map(({ contentsId, name }) => [String(contentsId), name])
      );
    },
    split: async () => {
      await splitWithCalendar(chrome);
    },
  };
};

const git = (...args: string[]) => execaSync("git", args, { cwd: root }).stdout;

const commit = () =>
  `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain", "--", ".", ":!measurements") === "" ? "" : "+dirty"}`;

/** Launches an app, reads it 5s after launch, right after one split, while the split's tab is dragged over the panes, with the launcher open, and after the idle time once the launcher has closed, and closes it. */
export const measureApp = async (
  options: MeasureOptions
): Promise<Measurement> => {
  const target =
    options.app === "meru"
      ? await launchMeru(options)
      : await launchFloor(options.app === "floor-view");
  const samples: Sample[] = [];
  const take = async (point: Point) => {
    samples.push({ point, readings: await sample(target, options.readings) });
  };
  try {
    await wait(SETTLE);
    await take("launch");
    await target.split();
    await take("split");
    const release = await target.drag();
    await take("tabDrag");
    await release();
    await target.openLauncher();
    await take("launcher");
    await target.closeLauncher();
    await wait(options.idleSeconds * 1000);
    await take("idle");
    return {
      app: options.app,
      at: new Date().toISOString(),
      blank: options.app !== "meru" || options.blank,
      commit: commit(),
      electron: await target.app.evaluate(() => process.versions.electron),
      host: hostname(),
      platform: process.platform,
      samples,
    };
  } finally {
    await target.close();
  }
};
