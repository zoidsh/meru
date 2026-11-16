import path from "node:path";

import { appIdFor } from "@meru/core/app-identity";
import { createAppLifecycle } from "@meru/platform/app";
import { createDevServerPolicy } from "@meru/platform/dev-server";
import { createErrorDialog } from "@meru/platform/dialog";
import { createDisplays } from "@meru/platform/displays";
import { createAppProtocol } from "@meru/platform/protocol";
import { createWindowFactory } from "@meru/platform/window";

import { createContentSecurityPolicy } from "./content-security-policy.ts";
import { createDevContentSecurityPolicy, readDevServer } from "./dev-server.ts";
import { createFailures } from "./failures.ts";
import { readLaunchOptions } from "./launch-options.ts";
import { decideUserData } from "./run-identity.ts";
import { createShellWindow, revealWindow } from "./shell-window.ts";

const APP_SCHEME = "meru-app";

const SHELL_HOST = "shell";

const lifecycle = createAppLifecycle();
const errorDialog = createErrorDialog();

const failures = createFailures({
  productName: MERU_PRODUCT_NAME,
  showErrorDialog: errorDialog.show,
  log: console.error,
  exit: lifecycle.exit,
});

process.on("uncaughtException", failures.report);
process.on("unhandledRejection", failures.report);

lifecycle.onBeforeQuit(failures.markQuitting);

/** The shell's URL, and the policy that lets it load. */
const resolveShell = () => {
  if (MERU_BUILD_MODE === "dev") {
    const devServer = readDevServer(process.env);

    return {
      url: devServer.url,
      apply: () => {
        createDevServerPolicy().apply({
          origin: new URL(devServer.url).origin,
          contentSecurityPolicy: createDevContentSecurityPolicy(devServer),
        });
      },
    };
  }

  return {
    url: `${APP_SCHEME}://${SHELL_HOST}/index.html`,
    apply: (appProtocol: ReturnType<typeof createAppProtocol>) => {
      appProtocol.serve({
        scheme: APP_SCHEME,
        root: import.meta.dirname,
        hosts: [SHELL_HOST],
        contentSecurityPolicy: createContentSecurityPolicy(),
      });
    },
  };
};

const start = async () => {
  const options = readLaunchOptions({ argv: process.argv, env: process.env });
  const shellSource = resolveShell();

  const userData = decideUserData({
    isPackaged: lifecycle.isPackaged,
    productName: MERU_PRODUCT_NAME,
    version: lifecycle.version,
    appData: lifecycle.getPath("appData"),
    installedNames: [MERU_PRODUCT_NAME, lifecycle.name],
    userDataDirSwitch: lifecycle.getSwitchValue("user-data-dir"),
    platform: process.platform,
  });

  // Before anything else: Electron creates its default folder, an installed
  // Meru's, on the way out of even a run that never used it.
  if (userData.kind === "use" && userData.move) {
    lifecycle.setUserDataPath(userData.dir);
  }

  // The suite asks where a build would keep its data without starting it,
  // which would create the folder and take its lock, and without the dialog a
  // refusal shows.
  if (MERU_E2E_BUILD && process.argv.includes("--print-user-data")) {
    if (userData.kind === "refuse") {
      console.error(userData.reason);
      lifecycle.exit(2);
    } else {
      console.log(userData.dir);
      lifecycle.exit(0);
    }

    return;
  }

  if (userData.kind === "refuse") {
    throw new Error(userData.reason);
  }

  // The suite's app is never used by anyone, so it never comes in front of
  // whatever someone is working in, whatever a test shows or focuses.
  const isTestBackground =
    MERU_E2E_BUILD && process.env.MERU_TEST_BACKGROUND === "1";

  if (isTestBackground) {
    lifecycle.preventActivation();
  }

  const background = options.background || isTestBackground;

  if (!lifecycle.requestSingleInstanceLock()) {
    lifecycle.quit();

    return;
  }

  // Guards a GNOME crash in GTK 4.
  if (process.platform === "linux") {
    lifecycle.appendSwitch("gtk-version", "3");
  }

  if (process.platform === "win32") {
    lifecycle.setAppUserModelId(
      appIdFor(MERU_APP_ID, {
        version: lifecycle.version,
        isRelease: lifecycle.isPackaged && !MERU_E2E_BUILD,
      })
    );
  }

  const appProtocol = createAppProtocol();

  appProtocol.registerPrivilegedScheme(APP_SCHEME);

  await lifecycle.whenReady();

  shellSource.apply(appProtocol);

  const shell = createShellWindow({
    windows: createWindowFactory(),
    displays: createDisplays(),
    title: MERU_PRODUCT_NAME,
    url: shellSource.url,
    preloadPath: path.join(import.meta.dirname, "preload-shell.cjs"),
    isMacOS: process.platform === "darwin",
    background,
  });

  lifecycle.onSecondInstance(() => {
    revealWindow(shell.window, background);
  });

  lifecycle.onWindowAllClosed(() => {
    lifecycle.quit();
  });

  await shell.load();

  failures.markStarted();
};

// Not awaited: Electron holds its `ready` event until an ESM entry has finished
// evaluating, so a top-level await on `whenReady()` would never return.
start().catch(failures.report);
