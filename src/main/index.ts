import path from "node:path";

import { profilePartition, selectedProfile } from "#core/state.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import { activateLanguage, resolveLanguage } from "#i18n/index.ts";
import { createAppLifecycle } from "#platform/app.ts";
import { createDevServerPolicy } from "#platform/dev-server.ts";
import { createErrorDialog } from "#platform/dialog.ts";
import { createDisplays } from "#platform/displays.ts";
import { createAppProtocol } from "#platform/protocol.ts";
import { createSystemBrowser } from "#platform/system-browser.ts";
import { createTextFile } from "#platform/text-file.ts";
import { createWindowFactory } from "#platform/window.ts";

import { createContentSecurityPolicy } from "./content-security-policy.ts";
import { createDevContentSecurityPolicy, readDevServer } from "./dev-server.ts";
import { createFailures } from "./failures.ts";
import { createGmailView } from "./gmail-view.ts";
import { createShellWindow, revealWindow } from "./shell-window.ts";
import { STATE_FILE_NAME, loadState } from "./state-store.ts";

const APP_SCHEME = "meru-app";

const SHELL_HOST = "shell";

const GMAIL_URL = "https://mail.google.com/mail/u/0";

// The suite's stand-in for Gmail, which only its build reads, opens its own
// pop-ups as sign-in's would open.
const standInUrl = MERU_E2E_BUILD ? process.env.MERU_TEST_GMAIL_URL : undefined;
const gmailUrl = standInUrl || GMAIL_URL;
const childWindowOrigins = standInUrl
  ? [new URL(standInUrl).origin]
  : SIGN_IN_ORIGINS;

const lifecycle = createAppLifecycle();
const errorDialog = createErrorDialog();

const failures = createFailures({
  productName: lifecycle.name,
  showErrorDialog: errorDialog.show,
  log: console.error,
  exit: lifecycle.exit,
});

process.on("uncaughtException", failures.report);
process.on("unhandledRejection", failures.report);

lifecycle.onBeforeQuit(failures.markQuitting);

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
  const shellSource = resolveShell();

  // The suite's app is never used by anyone, so it never comes in front of
  // whatever someone is working in, whatever a test shows or focuses.
  const isTestBackground =
    MERU_E2E_BUILD && process.env.MERU_TEST_BACKGROUND === "1";

  if (isTestBackground) {
    lifecycle.preventActivation();
  }

  // For a desktop other sessions share: open behind whatever is in front.
  const background =
    isTestBackground ||
    process.env.MERU_BACKGROUND === "1" ||
    process.argv.includes("--background");

  if (!lifecycle.requestSingleInstanceLock()) {
    lifecycle.quit();

    return;
  }

  // Guards a GNOME crash in GTK 4.
  if (process.platform === "linux") {
    lifecycle.appendSwitch("gtk-version", "3");
  }

  if (process.platform === "win32") {
    lifecycle.setAppUserModelId(MERU_APP_ID);
  }

  const appProtocol = createAppProtocol();

  appProtocol.registerPrivilegedScheme(APP_SCHEME);

  await lifecycle.whenReady();

  shellSource.apply(appProtocol);

  const language = resolveLanguage(lifecycle.preferredLanguages());

  activateLanguage(language);

  const state = await loadState({
    file: createTextFile(path.join(lifecycle.userDataPath, STATE_FILE_NAME)),
    newId: () => crypto.randomUUID(),
    now: Date.now,
    log: console.error,
  });

  const shellUrl = new URL(shellSource.url);

  shellUrl.searchParams.set("lang", language);

  const shell = createShellWindow({
    windows: createWindowFactory(),
    displays: createDisplays(),
    title: lifecycle.name,
    url: shellUrl.href,
    preloadPath: path.join(import.meta.dirname, "preload-shell.cjs"),
    isMacOS: process.platform === "darwin",
    background,
  });

  createGmailView({
    window: shell.window,
    partition: profilePartition(selectedProfile(state).id),
    url: gmailUrl,
    childWindowOrigins,
    background,
    systemBrowser: createSystemBrowser(),
    log: console.error,
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
