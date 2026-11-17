import { execFile, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs, promisify } from "node:util";

import { isEqual } from "es-toolkit";

import { outDir, repositoryRoot } from "../lib/bundles.ts";
import { stopElectron } from "../lib/launch.ts";
import { readFootprint } from "./footprint.ts";
import { connectInspector, watchStderr } from "./inspector.ts";
import type { Inspector } from "./inspector.ts";
import { POLL_MS, pollUntil } from "./poll.ts";
import { listProcesses, processTypeOf, treeOf } from "./processes.ts";
import { formatComparison, formatScenario } from "./report.ts";
import type { TargetResult } from "./report.ts";
import { metricsOf, nameRenderers } from "./sample.ts";
import type { RendererPages, RunSample } from "./sample.ts";
import type { Metrics } from "./stats.ts";
import {
  SCENARIOS,
  SCENARIO_DESCRIPTIONS,
  floorTarget,
  v3Target,
  v4Target,
} from "./targets.ts";
import type { Scenario, Target } from "./targets.ts";

const run = promisify(execFile);

const USAGE = `pnpm measure [options]
  --target <list>      v4, floor, v3, comma-separated (default v4,floor)
  --scenario <list>    ${SCENARIOS.join(", ")} (default gmail)
  --runs <n>           runs per target and scenario (default 3)
  --settle <s>         seconds to wait once the inbox is usable, or for v3 the window shows (default 30)
  --idle <s>           seconds of the idle CPU window (default 30)
  --v3-app <path>      an installed Meru 3's .app, for the v3 target
  --v3-user-data <dir> the user data directory v3 runs on, never a real one by default
  --compare <file>     an earlier run's JSON to print the difference against`;

const { values: options } = parseArgs({
  options: {
    target: { type: "string", default: "v4,floor" },
    scenario: { type: "string", default: "gmail" },
    runs: { type: "string", default: "3" },
    settle: { type: "string", default: "30" },
    idle: { type: "string", default: "30" },
    "v3-app": { type: "string" },
    "v3-user-data": { type: "string" },
    compare: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

const fail = (message: string): never => {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
};

const positive = (value: string, name: string) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0
    ? number
    : fail(`--${name} needs a whole number above 0.`);
};

const runsPerTarget = positive(options.runs, "runs");
const settleSeconds = positive(options.settle, "settle");
const idleSeconds = positive(options.idle, "idle");
const scenarios = options.scenario
  .split(",")
  .map((name) =>
    (SCENARIOS as readonly string[]).includes(name)
      ? (name as Scenario)
      : fail(`Unknown scenario ${name}.`)
  );

const makeTarget = (name: string): Target => {
  switch (name) {
    case "v4": {
      if (!existsSync(path.join(outDir("prod"), "package.json"))) {
        fail("Nothing is built in out/prod; run `pnpm build` first.");
      }

      return v4Target();
    }
    case "floor": {
      return floorTarget();
    }
    case "v3": {
      const app = options["v3-app"];
      const userData = options["v3-user-data"];

      return app && userData
        ? v3Target(path.resolve(app), path.resolve(userData))
        : fail("The v3 target needs --v3-app and --v3-user-data.");
    }
    default: {
      return fail(`Unknown target ${name}.`);
    }
  }
};

const targets = options.target.split(",").map(makeTarget);

/** The app in front, so a run that took the foreground is caught. */
const frontApp = async () => {
  const { stdout: asn } = await run("lsappinfo", ["front"]);
  const { stdout: info } = await run("lsappinfo", [
    "info",
    "-only",
    "name",
    asn.trim(),
  ]);

  return `${/^"(?<name>[^"]*)"/u.exec(info)?.groups?.name ?? "?"} ${asn.trim()}`;
};

/** Through `window list`, which sees a window on screen without the inspector. */
const hasWindowOnScreen = async (pid: number) => {
  const { stdout } = await run("window", ["list", String(pid)]).catch(() => ({
    stdout: "",
  }));

  return stdout.trim().length > 0;
};

const IS_INBOX_USABLE = `(async () => {
  const { webContents } = require("electron");
  const gmail = webContents.getAllWebContents().find((contents) => !contents.isDestroyed() && contents.getURL().startsWith("https://mail.google.com/"));
  if (!gmail) return false;
  const check = gmail.executeJavaScript('Boolean(document.querySelector(\\'[role="main"] [role="row"]\\'))').catch(() => false);
  return Promise.race([check, new Promise((resolve) => setTimeout(() => resolve(false), 1000))]);
})()`;

const PAGES = `(() => {
  const { webContents } = require("electron");
  const live = webContents.getAllWebContents().filter((contents) => !contents.isDestroyed());
  const pages = live.flatMap((contents) => [
    { pid: contents.getOSProcessId(), processId: contents.getProcessId(), url: contents.getURL(), isSubframe: false },
    ...contents.mainFrame.framesInSubtree.filter((frame) => frame !== contents.mainFrame).map((frame) => ({ pid: frame.osProcessId, processId: frame.processId, url: frame.url, isSubframe: true })),
  ]);
  const workers = [...new Set(live.map((contents) => contents.session))].flatMap((session) =>
    Object.values(session.serviceWorkers.getAllRunning()).map((worker) => ({ processId: worker.renderProcessId, scope: worker.scope })));
  return { pages, workers };
})()`;

let current: { child: ChildProcess; pids: Set<number> } | undefined;

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

/** Quits the target by its main process, then ends any helper left behind. */
const stopTarget = async (child: ChildProcess, pids: ReadonlySet<number>) => {
  await stopElectron(child);

  const deadline = performance.now() + 5000;

  while ([...pids].some(isAlive) && performance.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polled in turn
    await sleep(POLL_MS);
  }

  for (const pid of [...pids].filter(isAlive)) {
    console.log(`Helper ${pid} outlived its app; killing it`);
    process.kill(pid, "SIGKILL");
  }

  const left = [...pids].filter(isAlive);

  if (left.length > 0) {
    throw new Error(
      `Processes still running after the run: ${left.join(", ")}`
    );
  }
};

const withInspector = async <T>(
  url: Promise<string>,
  action: (inspector: Inspector) => Promise<T>
) => {
  const inspector = await connectInspector(await url);

  try {
    return await action(inspector);
  } finally {
    inspector.close();
  }
};

const measureOnce = async (
  target: Target,
  scenario: Scenario
): Promise<{ metrics: Metrics; sample: RunSample; front: string[] }> => {
  const front = [await frontApp()];

  await target.prepare(scenario);

  const start = performance.now();
  const child = target.launch();
  const rootPid = child.pid ?? fail("The target did not start.");
  const pids = new Set([rootPid]);

  current = { child, pids };

  const stderr = watchStderr(child);

  try {
    const windowShownMs = await pollUntil(
      async () =>
        (await hasWindowOnScreen(rootPid))
          ? performance.now() - start
          : undefined,
      "A window showing"
    );
    let inboxUsableMs: number | undefined;

    if (target.hasInspector) {
      // Attached once a window shows, since a `require("electron")` while
      // Electron is still loading leaves main a module without its APIs, and
      // closed before the app settles, so no debugger is attached while it is
      // measured; it is attached again after the samples to name renderers.
      inboxUsableMs = await withInspector(
        stderr.inspectorUrl,
        async (inspector) => {
          const usable = await pollUntil(
            async () =>
              (await inspector.evaluate<boolean>(IS_INBOX_USABLE))
                ? performance.now() - start
                : undefined,
            "The inbox becoming usable"
          );

          await target.afterUsable?.(inspector, scenario);

          return usable;
        }
      );
    }

    await sleep(settleSeconds * 1000);

    const before = treeOf(await listProcesses(), rootPid);

    await sleep(idleSeconds * 1000);

    const after = treeOf(await listProcesses(), rootPid);

    for (const entry of [...before, ...after]) {
      pids.add(entry.pid);
    }

    const footprint = await readFootprint(after.map((entry) => entry.pid));
    const cpuAtStart = new Map(
      before.map((entry) => [entry.pid, entry.cpuSeconds])
    );
    const cpuSeconds = after.reduce(
      (sum, entry) => sum + entry.cpuSeconds - (cpuAtStart.get(entry.pid) ?? 0),
      0
    );
    const types = new Map(
      after.map((entry) => [entry.pid, processTypeOf(entry, rootPid)])
    );
    const names = target.hasInspector
      ? nameRenderers({
          ...(await withInspector(stderr.inspectorUrl, (inspector) =>
            inspector.evaluate<Omit<RendererPages, "rendererPids">>(PAGES)
          )),
          rendererPids: after
            .filter((entry) => types.get(entry.pid)?.kind === "renderer")
            .map((entry) => entry.pid),
        })
      : new Map<number, string>();
    const sample: RunSample = {
      windowShownMs,
      ...(inboxUsableMs === undefined ? {} : { inboxUsableMs }),
      idleCpuPercent: (cpuSeconds / idleSeconds) * 100,
      processes: after.map((entry) => {
        const name = names.get(entry.pid);

        return {
          pid: entry.pid,
          type: types.get(entry.pid) ?? processTypeOf(entry, rootPid),
          ...(name === undefined ? {} : { name }),
          footprintBytes: footprint.byPid.get(entry.pid) ?? 0,
        };
      }),
      sharedOnceBytes: footprint.total,
    };
    const metrics = metricsOf(sample);

    if (target.appBytes !== undefined) {
      metrics["app size MB"] = target.appBytes / 1024 / 1024;
    }

    return { metrics, sample, front };
  } catch (error) {
    console.error(stderr.tail().slice(-2000));
    throw error;
  } finally {
    await stopTarget(child, pids);
    current = undefined;
    front.push(await frontApp());
  }
};

const stopOnSignal = (signal: NodeJS.Signals) => {
  console.log(`\n${signal}: stopping what was started`);

  const stopping = current
    ? stopTarget(current.child, current.pids)
    : Promise.resolve();

  void stopping.finally(() => process.exit(130));
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, stopOnSignal);
}

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf-8" }).trim();

const command = (file: string, ...args: string[]) =>
  execFileSync(file, args, { encoding: "utf-8" }).trim();

type MeasuredResult = TargetResult & {
  electronVersion: string;
  samples: RunSample[];
};

const plan = scenarios.flatMap((scenario) =>
  targets.map((target) => {
    const skipped = target.cannotRun?.(scenario);
    const result: MeasuredResult = {
      target: target.name,
      scenario,
      electronVersion: target.electronVersion,
      ...(skipped === undefined ? {} : { skipped }),
      runs: [],
      samples: [],
    };

    return { target, result };
  })
);
const results = plan.map(({ result }) => result);

console.log(
  `Measuring ${targets.map((target) => target.name).join(", ")}: ${runsPerTarget} runs each, ${settleSeconds} s settle and ${idleSeconds} s idle after the inbox is usable.`
);

for (const scenario of scenarios) {
  // Targets take turns run by run, so a drift on the machine falls on all of
  // them rather than on whichever ran last.
  for (let index = 0; index < runsPerTarget; index += 1) {
    for (const { target, result } of plan) {
      if (result.scenario !== scenario || result.skipped) {
        continue;
      }

      // oxlint-disable-next-line no-await-in-loop -- one app at a time
      const { metrics, sample, front } = await measureOnce(target, scenario);

      result.runs.push(metrics);
      result.samples.push(sample);
      console.log(
        `${scenario} ${target.name} run ${index + 1}: ${metrics["memory total"]?.toFixed(1)} MB, ${sample.processes.length} processes; front app ${front.join(" → ")}${front[0] === front[1] ? "" : " CHANGED"}`
      );
    }
  }
}

console.log("");

for (const scenario of scenarios) {
  console.log(
    `${formatScenario(
      `${scenario} (${SCENARIO_DESCRIPTIONS[scenario]})`,
      results.filter((result) => result.scenario === scenario)
    )}\n`
  );
}

console.log(
  "Memory: phys_footprint per process from `footprint`, in MB of 2^20 bytes; median (min–max). Idle CPU: % of one core. `~`: within the two targets' spread."
);

const report = {
  version: 1,
  date: new Date().toISOString(),
  commit: git("rev-parse", "HEAD"),
  isDirty: git("status", "--porcelain").length > 0,
  machine: {
    model: command("sysctl", "-n", "hw.model"),
    cpu: os.cpus()[0]?.model,
    cpus: os.cpus().length,
    memoryBytes: os.totalmem(),
  },
  os: `macOS ${command("sw_vers", "-productVersion")} (${command("sw_vers", "-buildVersion")})`,
  settings: { runsPerTarget, settleSeconds, idleSeconds },
  results,
};
const reportDir = path.join(repositoryRoot, ".meru", "measure");
const reportFile = path.join(
  reportDir,
  `${report.date.replaceAll(/[:.]/gu, "-")}.json`
);

await mkdir(reportDir, { recursive: true });
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Raw samples: ${reportFile}`);

if (options.compare) {
  const earlier = JSON.parse(readFileSync(options.compare, "utf-8")) as {
    results: TargetResult[];
    settings?: unknown;
  };
  // Memory falls through the settle, so runs with other windows differ by it.
  const settingsNote = isEqual(earlier.settings, report.settings)
    ? ""
    : `\nThe earlier run's settings differ: ${JSON.stringify(earlier.settings)}`;

  console.log(
    `\nAgainst ${options.compare}:${settingsNote}\n${formatComparison(results, earlier.results)}`
  );
}

process.exit(0);
