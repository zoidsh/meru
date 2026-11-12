// node scripts/dev.ts [--profile <name>] [--background] [any Electron argument…]
import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";

import { build, createServer } from "vite-plus";

import { resolveProfile, splitArgs } from "./lib/dev-args.ts";

const root = path.join(import.meta.dirname, "..");
// The electron package's main export, outside Electron, is the binary's path.
const electronBinary = String(createRequire(import.meta.url)("electron"));

const git = (...args: string[]) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
};

const { profile, background, electronArgs } = splitArgs(process.argv.slice(2));
const profileName = resolveProfile(profile, {
  branch: git("symbolic-ref", "--short", "HEAD"),
  gitCommonDir: path.resolve(root, git("rev-parse", "--git-common-dir")),
  gitDir: path.resolve(root, git("rev-parse", "--git-dir")),
  toplevel: root,
});
const userDataArgs =
  profileName === undefined
    ? []
    : [`--user-data-dir=${path.join(root, ".meru", profileName)}`];

const renderer = await createServer({
  configFile: path.join(root, "vite.renderer.ts"),
  server: { port: Number(process.env.PORT ?? 0) },
});
await renderer.listen();
// Read off the server, not the port asked for: with 0 or a taken port Vite picks its own.
const rendererBase = renderer.resolvedUrls?.local[0];
if (rendererBase === undefined) {
  throw new Error("The renderer dev server came up without a local URL");
}
const rendererUrl = new URL("chrome.html", rendererBase).href;

let electron: ChildProcess | undefined;
let stopping = false;

const shutdown = async (code: number) => {
  stopping = true;
  electron?.kill("SIGTERM");
  await renderer.close();
  process.exit(code);
};

const startElectron = () => {
  const child = spawn(electronBinary, [".", ...userDataArgs, ...electronArgs], {
    cwd: root,
    env: {
      ...process.env,
      MERU_RENDERER_URL: rendererUrl,
      ...(background ? { MERU_BACKGROUND: "1" } : {}),
    },
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    // Quitting the app ends the loop; a restart replaces the child before this one exits.
    if (electron === child && !stopping) {
      void shutdown(code ?? 0);
    }
  });
  electron = child;
};

const restartElectron = async () => {
  const previous = electron;
  electron = undefined;
  if (previous && previous.exitCode === null) {
    const exited = once(previous, "exit");
    previous.kill("SIGTERM");
    await exited;
  }
  startElectron();
};

const nodeConfigs = ["vite.main.ts", "vite.preload.ts", "vite.preload-drag.ts"];
const pending = new Set(nodeConfigs);

const watch = async (configFile: string) => {
  const watcher = await build({
    build: { watch: {} },
    configFile: path.join(root, configFile),
    logLevel: "warn",
  });
  if (!("on" in watcher)) {
    throw new Error(`${configFile} did not start in watch mode`);
  }
  watcher.on("event", (event) => {
    if (event.code !== "END") {
      return;
    }
    pending.delete(configFile);
    if (pending.size === 0) {
      void restartElectron();
    }
  });
};

await Promise.all(nodeConfigs.map(watch));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(0);
  });
}

console.log(
  `Renderer on ${rendererUrl}, profile ${profileName ?? "default"}${background ? ", in the background" : ""}`
);
