import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";

import { watch } from "rolldown";
import type { RolldownWatcher } from "rolldown";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

import {
  appBundles,
  cleanOutDir,
  outDir,
  readRootManifest,
  shellViteConfig,
  writeAppManifest,
} from "./lib/bundles.ts";
import { exitCodeFor, parseLaunchArgs } from "./lib/launch-args.ts";
import {
  reportDebugPort,
  resolveProfile,
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
let queue: Promise<void> = Promise.resolve();

const enqueue = (task: () => Promise<void>) => {
  const previous = queue;

  queue = (async () => {
    await previous;

    try {
      await task();
    } catch (error) {
      console.error(error);
    }
  })();

  return queue;
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

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => {
    void shutdown(0);
  });
}

// The last resort when the script dies some other way: no Electron outlives it.
process.once("exit", () => {
  if (electron && electron.exitCode === null && electron.signalCode === null) {
    electron.kill("SIGKILL");
  }
});

let args: ReturnType<typeof parseLaunchArgs>;

try {
  args = parseLaunchArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const profile = resolveProfile(args);

/** One per run, stamped by Vite on what it injects and allowed by the app. */
const nonce = randomBytes(16).toString("base64url");

const port = process.env.PORT ? Number(process.env.PORT) : 0;

if (!Number.isInteger(port) || port < 0) {
  console.error(`PORT is not a port number: ${process.env.PORT}`);
  process.exit(1);
}

const startElectron = (devServerUrl: string) => {
  const launched = spawnElectron({
    appDir: outDir("dev"),
    args,
    profile,
    env: { MERU_DEV_SERVER_URL: devServerUrl, MERU_DEV_CSP_NONCE: nonce },
  });
  const { child } = launched;

  electron = child;

  child.once("error", (error) => {
    console.error(error);
    void shutdown(1);
  });

  // Quitting the app, or its crashing, ends the run.
  child.once("exit", (code, signal) => {
    if (electron === child && !wasStoppedByScript(child)) {
      void shutdown(exitCodeFor(code, signal, false));
    }
  });

  void reportDebugPort(child, launched.userDataDir);
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
  const manifest = await readRootManifest();

  await cleanOutDir("dev");
  await writeAppManifest("dev", manifest);

  vite = await createServer({
    configFile: shellViteConfig,
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

  console.log(`Shell dev server: ${devServerUrl}`);

  if (isStopping) {
    return;
  }

  watcher = watch(appBundles("dev", manifest));

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
