/**
 * Measures which Chrome extension APIs stock Electron answers, and whether the
 * events behind them reach an MV3 service worker, with nothing of Meru's
 * loaded. The output is the evidence behind the rows Electron answers in the
 * private docs' `architecture/chrome-api-conformance.md`, so it is rerun at
 * every Electron upgrade.
 *
 *   bun scripts/probe-extension-api.ts [--electron <path to an Electron binary>]
 *
 * Without `--electron` it runs the Electron this repository installs. A probe
 * extension built from `probe-extension/` takes an inventory in its service
 * worker, an extension page and a content script, then fires each event once.
 * The browser is launched twice on one user data directory, the second time
 * with the worker's files changed and the version not, to see what survives a
 * restart.
 */

import { mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawn } from "bun";
import electronPath from "electron";
import {
  ALARM_DELAY_SECONDS,
  type Context,
  type Inventory,
  MEMBERS,
  NAMESPACES,
  PAGE_PATH,
  type RegisteredContentScript,
  type Settled,
  WORKER_FETCH_PATH,
} from "./probe-extension/protocol";

const ALARM_WATCH_SECONDS = 90;
/** Long enough for both storage writes, `onInstalled` and the page load. */
const EVENT_WATCH_SECONDS = 12;
const BOOT_TIMEOUT_SECONDS = 30;
const SECOND_LAUNCH_WATCH_SECONDS = 5;
const QUIT_TIMEOUT_SECONDS = 10;

const sourceDir = path.join(import.meta.dirname, "probe-extension");

const args = parseArgs({
  args: Bun.argv,
  options: {
    electron: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

// The `electron` package's entry is the path to its binary, which its types
// do not say
const electronBinary = args.values.electron ?? (electronPath as unknown as string);

const log = (message: string) => {
  console.error(`[probe] ${message}`);
};

type ProbeEventRecord = { context: Context; name: string; detail?: unknown; seconds: number };

type Launch = {
  startedAt: number;
  versions?: { electron?: string; chrome?: string };
  boot?: {
    launch: number;
    registeredScripts: Settled<RegisteredContentScript[]>;
    persistAlarm: Settled<unknown>;
  };
  /** From the worker's boot to the quit. */
  watchedSeconds?: number;
  inventories: Partial<Record<Context, Inventory>>;
  events: ProbeEventRecord[];
  output: string;
};

const createLaunch = (): Launch => ({
  startedAt: performance.now(),
  inventories: {},
  events: [],
  output: "",
});

let currentLaunch = createLaunch();

const secondsSince = (start: number) => (performance.now() - start) / 1000;

const TEST_PAGE = `<!doctype html><meta charset="utf-8"><title>Probe page</title><p>Probe page</p>`;

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const headers = { "Access-Control-Allow-Origin": "*" };

    if (request.method === "GET") {
      return pathname === PAGE_PATH
        ? new Response(TEST_PAGE, { headers: { ...headers, "Content-Type": "text/html" } })
        : new Response("ok", { headers });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const launch = currentLaunch;

    if (pathname === "/versions") {
      launch.versions = body;
    } else if (pathname === "/boot") {
      launch.boot ??= body as Launch["boot"];
    } else if (pathname === "/inventory") {
      launch.inventories[body.context as Context] ??= body.inventory as Inventory;
    } else if (pathname === "/event") {
      launch.events.push({
        ...(body as ProbeEventRecord),
        seconds: secondsSince(launch.startedAt),
      });
    } else if (pathname === "/log") {
      log(JSON.stringify(body));
    }

    return new Response("ok", { headers });
  },
});

const origin = `http://127.0.0.1:${server.port}`;

const workDir = await mkdtemp(path.join(os.tmpdir(), "meru-probe-extension-"));
const extensionDir = path.join(workDir, "extension");
const userDataDir = path.join(workDir, "user-data");

/** One permission per namespace that needs one, so a namespace is never missing for want of it. */
const PERMISSIONS = [
  "accessibilityFeatures.read",
  "alarms",
  "audio",
  "bookmarks",
  "browsingData",
  "certificateProvider",
  "contentSettings",
  "contextMenus",
  "cookies",
  "debugger",
  "declarativeContent",
  "declarativeNetRequest",
  "desktopCapture",
  "dns",
  "downloads",
  "enterprise.deviceAttributes",
  "enterprise.hardwarePlatform",
  "enterprise.networkingAttributes",
  "enterprise.platformKeys",
  "fileBrowserHandler",
  "fileSystemProvider",
  "fontSettings",
  "gcm",
  "history",
  "identity",
  "idle",
  "loginState",
  "management",
  "notifications",
  "offscreen",
  "pageCapture",
  "platformKeys",
  "power",
  "printerProvider",
  "printing",
  "printingMetrics",
  "privacy",
  "processes",
  "proxy",
  "readingList",
  "scripting",
  "search",
  "sessions",
  "sidePanel",
  "storage",
  "system.cpu",
  "system.display",
  "system.memory",
  "system.storage",
  "systemLog",
  "tabCapture",
  "tabGroups",
  "tabs",
  "topSites",
  "tts",
  "ttsEngine",
  "userScripts",
  "vpnProvider",
  "wallpaper",
  "webAuthenticationProxy",
  "webNavigation",
  "webRequest",
];

const MATCHES = ["http://127.0.0.1/*"];

/**
 * Builds the extension for one launch. Only the launch number differs between
 * builds, so the second launch's worker is the same extension version with
 * different files, which is what a stale stored worker script shows up on.
 */
async function buildExtension(launch: number) {
  const result = await Bun.build({
    entrypoints: ["worker.ts", "page.ts", "content.ts", "dynamic.ts"].map((fileName) =>
      path.join(sourceDir, fileName),
    ),
    outdir: extensionDir,
    target: "browser",
    format: "iife",
    define: {
      __PROBE_ORIGIN__: JSON.stringify(origin),
      __PROBE_LAUNCH__: String(launch),
    },
  });

  if (!result.success) {
    throw new AggregateError(result.logs, "The probe extension failed to build");
  }

  await copyFile(path.join(sourceDir, "page.html"), path.join(extensionDir, "page.html"));

  await writeFile(
    path.join(extensionDir, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Extension API probe",
      version: "1.0.0",
      background: { service_worker: "worker.js" },
      action: {},
      commands: {},
      omnibox: { keyword: "probe" },
      permissions: PERMISSIONS,
      host_permissions: MATCHES,
      content_scripts: [{ matches: MATCHES, js: ["content.js"], run_at: "document_idle" }],
    }),
  );
}

async function buildMain() {
  const result = await Bun.build({
    entrypoints: [path.join(sourceDir, "main.ts")],
    outdir: workDir,
    naming: "main.cjs",
    target: "node",
    format: "cjs",
    external: ["electron"],
  });

  if (!result.success) {
    throw new AggregateError(result.logs, "The probe's main process failed to build");
  }

  return path.join(workDir, "main.cjs");
}

async function waitFor(condition: () => boolean, timeoutSeconds: number) {
  const start = performance.now();

  while (!condition() && secondsSince(start) < timeoutSeconds) {
    await Bun.sleep(250);
  }

  return condition();
}

const findEvent = (launch: Launch, context: Context, name: string) =>
  launch.events.find((event) => event.context === context && event.name === name);

async function runLaunch(mainPath: string, launchNumber: number) {
  await buildExtension(launchNumber);

  const launch = createLaunch();

  currentLaunch = launch;

  log(`Launch ${launchNumber}: ${electronBinary}`);

  const electron = spawn(
    [electronBinary, mainPath, `--user-data-dir=${userDataDir}`, "--enable-logging=stderr"],
    {
      env: {
        ...process.env,
        PROBE_ORIGIN: origin,
        PROBE_EXTENSION_DIR: extensionDir,
        ELECTRON_ENABLE_LOGGING: "1",
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const output = Promise.all([
    new Response(electron.stdout).text(),
    new Response(electron.stderr).text(),
  ]);

  const send = (command: string) => {
    electron.stdin.write(`${command}\n`);
    void electron.stdin.flush();
  };

  if (await waitFor(() => launch.boot !== undefined, BOOT_TIMEOUT_SECONDS)) {
    send("open-web");

    const bootedAt = performance.now();

    if (launchNumber === 1) {
      const alarmCreated = () => findEvent(launch, "worker", "alarms.create");

      await waitFor(
        () =>
          secondsSince(bootedAt) >= EVENT_WATCH_SECONDS &&
          launch.inventories.content !== undefined &&
          (findEvent(launch, "worker", "alarms.onAlarm") !== undefined ||
            secondsSince(launch.startedAt) - (alarmCreated()?.seconds ?? Infinity) >=
              ALARM_WATCH_SECONDS),
        ALARM_WATCH_SECONDS + EVENT_WATCH_SECONDS + BOOT_TIMEOUT_SECONDS,
      );
    } else {
      await Bun.sleep(SECOND_LAUNCH_WATCH_SECONDS * 1000);
    }

    launch.watchedSeconds = secondsSince(bootedAt);
  }

  send("quit");

  if (
    (await Promise.race([electron.exited, Bun.sleep(QUIT_TIMEOUT_SECONDS * 1000)])) === undefined
  ) {
    log(`Launch ${launchNumber}: Electron did not quit, killing it`);
    electron.kill();
  }

  launch.output = (await output).join("\n");

  if (launch.boot === undefined) {
    log(`Launch ${launchNumber}: the worker never reported booting. Electron's output ended:`);
    log(launch.output.split("\n").slice(-30).join("\n"));
  }

  return launch;
}

const show = (type: string | undefined) =>
  type === undefined ? "?" : type === "undefined" ? "—" : type;

function inventoryTable(launch: Launch) {
  const contexts: Context[] = ["worker", "page", "content"];
  const rows = [...NAMESPACES, ...MEMBERS].map(
    (dottedPath) =>
      `| \`${dottedPath}\` | ${contexts.map((context) => show(launch.inventories[context]?.[dottedPath])).join(" | ")} |`,
  );

  return [
    "| Namespace or member | Service worker | Extension page | Content script |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}

const formatSeconds = (seconds: number) => `${seconds.toFixed(1)} s`;

function describeUnavailable(launch: Launch, context: Context, name: string) {
  const unavailable = findEvent(launch, context, `${name}:unavailable`);

  return unavailable
    ? `no listener could be added: the event is \`${String(unavailable.detail)}\``
    : undefined;
}

function describeFiring(launch: Launch, context: Context, name: string, watchedFor: string) {
  const unavailable = describeUnavailable(launch, context, name);

  if (unavailable) {
    return unavailable;
  }

  const fired = launch.events.filter((event) => event.context === context && event.name === name);

  if (fired.length === 0) {
    return `silent for ${watchedFor}`;
  }

  return `fired ${fired.length}×: ${fired.map((event) => `${JSON.stringify(event.detail)} at ${formatSeconds(event.seconds)}`).join("; ")}`;
}

function requestFirings(launch: Launch, name: string, requestPath: string) {
  const unavailable = describeUnavailable(launch, "worker", name);

  if (unavailable) {
    return unavailable;
  }

  const fired = launch.events.filter(
    (event) =>
      event.context === "worker" &&
      event.name === name &&
      (event.detail as { path?: string }).path === requestPath,
  );

  return fired.length === 0
    ? "silent"
    : fired
        .map(({ detail }) => {
          const { type, tabId } = detail as { type: string; tabId: number };

          return `fired (${type}, tabId ${tabId})`;
        })
        .join("; ");
}

/** The lines of Electron's output that carry `marker`, counted, with the first few distinct ones. */
function outputLinesSummary(launch: Launch, marker: string) {
  const lines = launch.output.split("\n").filter((line) => line.includes(marker));

  if (lines.length === 0) {
    return "none";
  }

  const distinct = [...new Set(lines.map((line) => line.replace(/^\[[^\]]*\]\s*/, "").trim()))];

  return `${lines.length}: ${distinct
    .slice(0, 3)
    .map((line) => `\`${line}\``)
    .join(", ")}`;
}

/**
 * A stale worker is the first launch's code, which registers the script again,
 * so a run after it says nothing about what was persisted.
 */
function describeDynamicScriptRun(second: Launch) {
  const ran = findEvent(second, "content", "scripting.dynamicScriptRan") ? "yes" : "no";

  return second.boot?.launch === 2 ? ran : `${ran}, after the stale worker had registered it again`;
}

/** `args` is what the call is shown with, already written out as source. */
type MemberCallResult = { member: string; args: string[]; value?: unknown; error?: string };

const truncate = (text: string) => (text.length > 120 ? `${text.slice(0, 120)}…` : text);

const json = (value: unknown) => `\`${JSON.stringify(value)}\``;

function firingTable(first: Launch, second: Launch) {
  const alarmCreated = findEvent(first, "worker", "alarms.create");
  const alarmFired = findEvent(first, "worker", "alarms.onAlarm");
  const storageWrites = first.events.filter((event) => event.name === "storage.write");
  const registered = findEvent(first, "worker", "scripting.register");
  const watched = formatSeconds(first.watchedSeconds ?? 0);

  const rows: [string, string][] = [
    [
      `\`alarms.onAlarm\`, worker, ${ALARM_DELAY_SECONDS} s alarm`,
      alarmFired && alarmCreated
        ? `fired ${formatSeconds(alarmFired.seconds - alarmCreated.seconds)} after \`create\` (${json(alarmCreated.detail)})`
        : `${describeFiring(first, "worker", "alarms.onAlarm", `${ALARM_WATCH_SECONDS} s`)}; \`create\` answered ${json(alarmCreated?.detail)}`,
    ],
    [
      "`alarms.onAlarm`, extension page",
      describeFiring(first, "page", "alarms.onAlarm", "the same run"),
    ],
    [
      "`storage.onChanged`, worker, after two worker writes",
      `${describeFiring(first, "worker", "storage.onChanged", watched)}; writes answered ${json(storageWrites.map((event) => event.detail))}`,
    ],
    [
      "`storage.local.onChanged`, worker",
      describeFiring(first, "worker", "storage.local.onChanged", watched),
    ],
    [
      "`storage.onChanged`, extension page",
      describeFiring(first, "page", "storage.onChanged", "the same run"),
    ],
    [
      "`runtime.onInstalled`, worker, fresh profile",
      describeFiring(first, "worker", "runtime.onInstalled", watched),
    ],
    [
      "`runtime.onInstalled`, worker, relaunch",
      describeFiring(second, "worker", "runtime.onInstalled", "the relaunch"),
    ],
    [
      "`runtime.sendMessage`, page to worker",
      json(findEvent(first, "page", "runtime.sendMessage")?.detail),
    ],
    [
      "`scripting.registerContentScripts` with `persistAcrossSessions: true`",
      `\`getRegisteredContentScripts\` after registering: ${json(registered?.detail)}`,
    ],
    [
      "… after quitting and relaunching on the same profile",
      `\`getRegisteredContentScripts\`: ${json(second.boot?.registeredScripts)}; the script ran on the relaunch's page load: ${describeDynamicScriptRun(second)}`,
    ],
    [
      "`alarms` after relaunching, a 60-minute alarm",
      `\`alarms.get\`: ${json(second.boot?.persistAlarm)}`,
    ],
    [
      "Worker script after relaunching with its file changed and the version not",
      second.boot === undefined
        ? "the worker never started"
        : second.boot.launch === 2
          ? "the changed script ran"
          : `the stored script from launch ${second.boot.launch} ran`,
    ],
    [
      "`webRequest.onBeforeRequest`, worker, the worker's own fetch",
      requestFirings(first, "webRequest.onBeforeRequest", WORKER_FETCH_PATH),
    ],
    [
      "`webRequest.onBeforeRequest`, worker, a page load",
      requestFirings(first, "webRequest.onBeforeRequest", PAGE_PATH),
    ],
    [
      "`webRequest.onCompleted`, worker, a page load",
      requestFirings(first, "webRequest.onCompleted", PAGE_PATH),
    ],
    [
      "`NOTREACHED` lines in Electron's output, first launch",
      outputLinesSummary(first, "NOTREACHED"),
    ],
    ["`NOTREACHED` lines in Electron's output, relaunch", outputLinesSummary(second, "NOTREACHED")],
    ["`chrome.permissions` in the worker", show(first.inventories.worker?.permissions)],
    ...first.events
      .filter((event) => event.name === "call")
      .map((event): [string, string] => {
        const { member, args, value, error } = event.detail as MemberCallResult;

        return [
          `\`${member}(${args.join(", ")})\`, ${event.context === "worker" ? "worker" : "content script"}`,
          error === undefined
            ? `answered ${truncate(JSON.stringify(value) ?? "undefined")}`
            : `failed: ${error}`,
        ];
      }),
    [
      "`Unknown Extension API` lines in Electron's output, first launch",
      outputLinesSummary(first, "Unknown Extension API"),
    ],
  ];

  return [
    "| Probe | Result |",
    "|---|---|",
    ...rows.map(([probe, result]) => `| ${probe} | ${result.replaceAll("|", "\\|")} |`),
  ].join("\n");
}

try {
  const mainPath = await buildMain();
  const first = await runLaunch(mainPath, 1);
  const second = await runLaunch(mainPath, 2);
  const { electron, chrome } = first.versions ?? {};

  if (!electron || !chrome) {
    log("Electron never reported its versions, so nothing it measured can be attributed to one");
    log(first.output.split("\n").slice(-20).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      [
        `Electron ${electron}, Chromium ${chrome}, ${process.platform} ${process.arch}`,
        "",
        "## Inventory, `typeof chrome.<path>`",
        "",
        "— is `undefined`, and ? a context that never reported.",
        "",
        inventoryTable(first),
        "",
        "## Events and persistence",
        "",
        firingTable(first, second),
      ].join("\n"),
    );
  }
} finally {
  await server.stop(true);
  await rm(workDir, { recursive: true, force: true });
}
