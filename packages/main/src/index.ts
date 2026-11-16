import path from "node:path";

import { createAppLifecycle } from "@meru/platform/app";
import { createErrorDialog } from "@meru/platform/dialog";
import { createDisplays } from "@meru/platform/displays";
import { createAppProtocol } from "@meru/platform/protocol";
import { createWindowFactory } from "@meru/platform/window";

import { build } from "./build-constants.ts";
import { createContentSecurityPolicy } from "./content-security-policy.ts";
import { readLaunchOptions } from "./launch-options.ts";
import { createShellWindow, revealWindow } from "./shell-window.ts";

const APP_SCHEME = "meru-app";

const SHELL_HOST = "shell";

const lifecycle = createAppLifecycle();
const errorDialog = createErrorDialog();

let hasFailed = false;

/** Any error before or during startup ends in a dialog, never a silent exit. */
const fail = (error: unknown) => {
  if (hasFailed) {
    return;
  }

  hasFailed = true;

  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);

  console.error(detail);
  errorDialog.show(`${build.productName} could not start`, detail);
  lifecycle.exit(1);
};

process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

const start = async () => {
  const options = readLaunchOptions({
    argv: process.argv,
    env: process.env,
    isDevBuild: build.mode === "dev",
  });

  // Without this, a run from the repository would share the user data
  // directory, and so the cookies and the single instance lock, of an
  // installed Meru.
  if (!(lifecycle.isPackaged || lifecycle.hasSwitch("user-data-dir"))) {
    throw new Error(
      "An unpackaged run needs --user-data-dir; start it with `pnpm dev` or `pnpm start`."
    );
  }

  if (!lifecycle.requestSingleInstanceLock()) {
    lifecycle.quit();

    return;
  }

  // Guards a GNOME crash in GTK 4.
  if (process.platform === "linux") {
    lifecycle.appendSwitch("gtk-version", "3");
  }

  if (process.platform === "win32") {
    lifecycle.setAppUserModelId(build.appId);
  }

  const appProtocol = createAppProtocol();

  appProtocol.registerPrivilegedScheme(APP_SCHEME);

  await lifecycle.whenReady();

  const contentSecurityPolicy = createContentSecurityPolicy(options.devServer);

  if (options.devServer) {
    appProtocol.applyToDevServer({
      origin: new URL(options.devServer.url).origin,
      contentSecurityPolicy,
    });
  } else {
    appProtocol.serve({
      scheme: APP_SCHEME,
      root: import.meta.dirname,
      hosts: [SHELL_HOST],
      contentSecurityPolicy,
    });
  }

  const shell = createShellWindow({
    windows: createWindowFactory(),
    displays: createDisplays(),
    title: build.productName,
    url: options.devServer?.url ?? `${APP_SCHEME}://${SHELL_HOST}/index.html`,
    preloadPath: path.join(import.meta.dirname, "preload-shell.cjs"),
    isMacOS: process.platform === "darwin",
    background: options.background,
  });

  lifecycle.onSecondInstance(() => {
    revealWindow(shell.window, options.background);
  });

  lifecycle.onWindowAllClosed(() => {
    lifecycle.quit();
  });

  await shell.load();
};

// Not awaited: Electron holds its `ready` event until an ESM entry has finished
// evaluating, so a top-level await on `whenReady()` would never return.
start().catch(fail);
