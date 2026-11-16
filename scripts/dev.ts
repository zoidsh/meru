import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";

import { watch } from "rolldown";
import { createServer } from "vite";

import {
  appBundles,
  cleanOutDir,
  outDir,
  readRootManifest,
  shellViteConfig,
  writeAppManifest,
} from "./lib/bundles.ts";
import { launchElectron, parseLaunchArgs, stopElectron } from "./lib/launch.ts";

const args = parseLaunchArgs(process.argv.slice(2));
const manifest = await readRootManifest();

await cleanOutDir("dev");
await writeAppManifest("dev", manifest);

/** One per run, stamped by Vite on what it injects and allowed by the app. */
const nonce = randomBytes(16).toString("base64url");

const port = process.env.PORT ? Number(process.env.PORT) : 0;

if (!Number.isInteger(port) || port < 0) {
  console.error(`PORT is not a port number: ${process.env.PORT}`);
  process.exit(1);
}

const vite = await createServer({
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

let electron: ChildProcess | undefined;
let isStopping = false;

const watcher = watch(appBundles("dev", manifest));

const stop = async (code: number) => {
  if (isStopping) {
    return;
  }

  isStopping = true;

  if (electron) {
    await stopElectron(electron);
  }

  await Promise.all([watcher.close(), vite.close()]);
  process.exit(code);
};

const startElectron = async () => {
  const child = await launchElectron({
    appDir: outDir("dev"),
    args,
    env: { MERU_DEV_SERVER_URL: devServerUrl, MERU_DEV_CSP_NONCE: nonce },
  });

  // Quitting the app ends the run, as stopping the script would.
  child.once("exit", (code) => {
    if (electron === child) {
      electron = undefined;
      void stop(code ?? 0);
    }
  });

  electron = child;
};

const restartElectron = async () => {
  const previous = electron;

  electron = undefined;

  if (previous) {
    await stopElectron(previous);
  }

  await startElectron();
};

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
  } else if (event.code === "END" && !hasRoundFailed && !isStopping) {
    await restartElectron();
  }
});

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
