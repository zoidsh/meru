import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { Mutex } from "es-toolkit";
import { watch } from "rolldown";
import type { RolldownWatcher } from "rolldown";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

import {
  appBundles,
  cleanOutDir,
  copySounds,
  copyTrayImages,
  outDir,
  rendererViteConfig,
  repositoryRoot,
  writeAppManifest,
} from "./lib/bundles.ts";
import { exitCodeFor } from "./lib/launch-args.ts";
import {
  readLaunchArgs,
  spawnElectron,
  stopElectron,
  wasStoppedByScript,
} from "./lib/launch.ts";

let electron: ChildProcess | undefined;
let vite: ViteDevServer | undefined;
let watcher: RolldownWatcher | undefined;
let isStopping = false;

/*
 * Starting and stopping Electron run one at a time, in order, so a restart
 * never overlaps another or a shutdown.
 */
const electronLock = new Mutex();

const enqueue = async (task: () => Promise<void>) => {
  await electronLock.acquire();

  try {
    await task();
  } catch (error) {
    console.error(error);
  } finally {
    electronLock.release();
  }
};

let setup: Promise<void> = Promise.resolve();

const shutdown = async (code: number) => {
  if (isStopping) {
    return;
  }

  isStopping = true;

  await setup.catch(() => {
    // Whatever setup got as far as starting is stopped below.
  });
  await enqueue(async () => {
    if (electron) {
      await stopElectron(electron);
    }
  });
  await Promise.all([watcher?.close(), vite?.close()]);
  process.exit(code);
};

// A repeated signal, such as a second Ctrl-C, joins the shutdown under way.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    void shutdown(0);
  });
}

// The last resort when the script dies some other way: no Electron outlives it.
process.once("exit", () => {
  if (electron && electron.exitCode === null && electron.signalCode === null) {
    electron.kill("SIGKILL");
  }
});

const { args, profile } = readLaunchArgs();

/** One per run, stamped by Vite on what it injects and allowed by the app. */
const nonce = randomBytes(16).toString("base64url");

const port = process.env.PORT ? Number(process.env.PORT) : 0;

if (!Number.isInteger(port) || port < 0) {
  console.error(`PORT is not a port number: ${process.env.PORT}`);
  process.exit(1);
}

const startElectron = (devServerUrl: string) => {
  const child = spawnElectron({
    appDir: outDir("dev"),
    args,
    profile,
    env: { MERU_DEV_SERVER_URL: devServerUrl, MERU_DEV_CSP_NONCE: nonce },
  });

  electron = child;

  child.once("error", (error) => {
    console.error(error);
    void shutdown(1);
  });

  // Quitting the app, or its crashing, ends the run.
  child.once("exit", (code, signal) => {
    if (electron === child && !wasStoppedByScript(child)) {
      void shutdown(exitCodeFor(code, signal));
    }
  });
};

let isRestartQueued = false;

const queueRestart = (devServerUrl: string) => {
  if (isRestartQueued) {
    return;
  }

  isRestartQueued = true;

  void enqueue(async () => {
    isRestartQueued = false;

    if (isStopping) {
      return;
    }

    if (electron) {
      await stopElectron(electron);
    }

    if (!isStopping) {
      startElectron(devServerUrl);
    }
  });
};

setup = (async () => {
  await cleanOutDir("dev");
  await writeAppManifest("dev");
  await copyTrayImages("dev");
  await copySounds("dev");

  vite = await createServer({
    configFile: rendererViteConfig,
    // One server for every renderer, each under its folder's name.
    root: path.join(repositoryRoot, "src"),
    mode: "development",
    html: { cspNonce: nonce },
    server: {
      host: "127.0.0.1",
      // 0 lets the system pick a free port; a given one is held to.
      port,
      strictPort: true,
    },
  });

  await vite.listen();

  const devServerUrl = vite.resolvedUrls?.local[0];

  if (!devServerUrl) {
    throw new Error("The Vite dev server reported no URL");
  }

  console.log(`Renderers' dev server: ${devServerUrl}`);

  if (isStopping) {
    return;
  }

  watcher = watch(appBundles("dev"));

  /** A round that failed keeps the running app, rather than one that cannot start. */
  let hasRoundFailed = false;

  watcher.on("event", async (event) => {
    if (event.code === "START") {
      hasRoundFailed = false;
    } else if (event.code === "BUNDLE_END") {
      await event.result.close();
    } else if (event.code === "ERROR") {
      hasRoundFailed = true;
      console.error(event.error);
      await event.result.close();
    } else if (event.code === "END" && !hasRoundFailed) {
      queueRestart(devServerUrl);
    }
  });
})();

try {
  await setup;
} catch (error) {
  console.error(error);
  await shutdown(1);
}
