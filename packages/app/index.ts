import { is, platform } from "@electron-toolkit/utils";
import { APP_ID } from "@meru/shared/constants";
import { app, session } from "electron";
import { accounts } from "@/accounts";
import { blocker } from "@/blocker";
import { bookmarks } from "@/bookmarks";
import { config } from "@/config";
import { downloads } from "@/downloads";
import {
  extensions,
  extensionUpdater,
  pruneDerivedExtensionCopies,
  pruneInstalledExtensionVersions,
  setupExtensionsWorkerSession,
} from "@/extensions";
import { ipc } from "@/ipc";
import { initLinuxWindowControls } from "@/lib/linux";
import { log } from "@/lib/log";
import { relaunchApp } from "@/lib/relaunch";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import {
  findMailtoUrlArg,
  findMeruUrlArg,
  findWebUrlArg,
  handleMailtoUrl,
  handleMeruUrl,
  handleWebUrl,
  isMailtoUrl,
  PROCESS_MAILTO_URL_ARG,
  PROCESS_MERU_URL_ARG,
  PROCESS_WEB_URL_ARG,
  setMeruProtocolClient,
} from "@/protocol";
import { refreshIsDefaultBrowser } from "@/protocol/default-browser";
import { registerWindowsMailClient } from "@/protocol/windows-mail-client";
import { theme } from "@/theme";
import { appTray } from "@/tray";
import { appUpdater } from "@/updater";
import { doNotDisturb } from "./do-not-disturb";
import { isMeruUrl, isWebUrl } from "./lib/deep-link";
import { spellchecker } from "./spellchecker";
import { trial } from "./trial";

async function resetApp() {
  const accounts = config.get("accounts");

  await app.whenReady();

  await Promise.all(
    accounts.map((account) => {
      const accountSession = session.fromPartition(`persist:${account.id}`);

      return Promise.all([
        accountSession.clearCache(),
        accountSession.clearStorageData(),
        extensions.clearSessionData(accountSession),
      ]);
    }),
  );

  // The one extension worker runs in the default session, so its
  // `chrome.storage` and its IndexedDB are the only account data no account
  // partition holds. Deliberately without a `clearStorageData()` beside it:
  // the default session's storage path is `userData` itself, where that would
  // reach far past the extensions
  await extensions.clearSessionData(session.defaultSession);

  config.clear();

  relaunchApp();

  app.quit();
}

async function init() {
  // electron-log writes every level to the file by default, `silly` up, and the
  // extension worker's console is forwarded at debug, so a shipped build would
  // otherwise write 1Password's own chatter to disk for as long as it ran: a
  // lock poll pair every fifteen seconds, sync and cache lines, feature-flag
  // dumps of several kilobytes. Info keeps Meru's own lines and every worker
  // error. Development keeps everything, since the worker has no DevTools
  // surface in Meru and its console is where 1Password says why it declined to
  // fill; the console transport is left at its default for the same reason.
  // Set here rather than in `lib/log.ts`, which unit tests import through
  // `load-url.ts` and which therefore can't touch `app` at module load.
  if (!is.dev) {
    log.transports.file.level = "info";
  }

  if (platform.isLinux) {
    app.commandLine.appendSwitch("gtk-version", "3");
    app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
  }

  if (platform.isWindows) {
    app.setAppUserModelId(APP_ID);
  }

  setMeruProtocolClient();

  if (!app.requestSingleInstanceLock()) {
    app.quit();

    return;
  }

  if (config.get("app.hardwareAcceleration") === false) {
    app.disableHardwareAcceleration();
  }

  if (config.get("resetApp") === true) {
    await resetApp();

    return;
  }

  downloads.init();

  await app.whenReady();

  licenseKey.init();

  if (!(await licenseKey.validate())) {
    app.quit();

    return;
  }

  if (!(await trial.validate())) {
    app.quit();

    return;
  }

  // The team id is only known to signed builds, and without it the keychain
  // access group can't match the `keychain-access-groups` entitlement. Touch ID
  // enrollment is Pro, so this sits after the validation that settles
  // `isValid`. `configureWebAuthn` only sets a static that the WebAuthn
  // delegate reads per request, so it takes effect whenever it is called, and
  // here it is still ahead of the first view
  if (platform.isMacOS && process.env.APPLE_TEAM_ID && licenseKey.isValid) {
    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup: `${process.env.APPLE_TEAM_ID}.${APP_ID}.webauthn`,
      },
    });
  }

  blocker.init();

  spellchecker.init();

  // Both prunes delete what the sessions are about to read from, so they run
  // before the first session derives its copies rather than alongside
  await pruneInstalledExtensionVersions();

  await pruneDerivedExtensionCopies();

  // Before the accounts, so the one worker is loading while their
  // content-script-only copies come up rather than after them
  setupExtensionsWorkerSession();

  accounts.init();

  await initLinuxWindowControls();

  theme.init();

  main.init();

  main.loadURL();

  accounts.createViews();

  ipc.init();

  theme.listen();

  appMenu.init();

  appTray.init();

  appUpdater.init();

  extensionUpdater.init();

  doNotDisturb.init();

  registerWindowsMailClient();

  if (!platform.isMacOS) {
    if (PROCESS_MAILTO_URL_ARG) {
      handleMailtoUrl(PROCESS_MAILTO_URL_ARG);
    } else if (PROCESS_MERU_URL_ARG) {
      main.show();

      handleMeruUrl(PROCESS_MERU_URL_ARG);
    } else if (PROCESS_WEB_URL_ARG) {
      main.show();

      handleWebUrl(PROCESS_WEB_URL_ARG);
    }
  }

  app.on("second-instance", (_event, argv) => {
    main.show();

    if (!platform.isMacOS) {
      const mailtoUrlArg = findMailtoUrlArg(argv);

      if (mailtoUrlArg) {
        handleMailtoUrl(mailtoUrlArg);

        return;
      }

      const meruUrlArg = findMeruUrlArg(argv);

      if (meruUrlArg) {
        handleMeruUrl(meruUrlArg);

        return;
      }

      const webUrlArg = findWebUrlArg(argv);

      if (webUrlArg) {
        handleWebUrl(webUrlArg);

        return;
      }
    }
  });

  app.on("activate", () => {
    main.show();
  });

  // Changing the default browser happens outside Meru, so coming back to it is
  // the moment the answer `openExternalUrl` holds can have gone stale.
  app.on("browser-window-focus", () => {
    refreshIsDefaultBrowser();
  });

  if (platform.isMacOS) {
    app.on("did-become-active", () => {
      main.showOnActivation();
    });

    app.on("open-url", (_event, url) => {
      if (isMailtoUrl(url)) {
        handleMailtoUrl(url);
      }

      if (isMeruUrl(url)) {
        main.show();

        handleMeruUrl(url);
      }

      if (isWebUrl(url)) {
        main.show();

        handleWebUrl(url);
      }
    });
  }

  if (!app.commandLine.hasSwitch("disable-bring-to-top-on-focus")) {
    main.window.on("focus", () => {
      if (main.location === "/") {
        accounts.getSelectedAccount().instance.gmail.view.webContents.focus();
      }
    });
  }

  app.on("before-quit", () => {
    if (!main.isQuittingApp) {
      main.saveWindowState();

      accounts.saveTabs();

      main.isQuittingApp = true;
    }

    // Taken down before the windows they depend on, so quitting never reaches
    // into a view the window destroyed underneath it
    bookmarks.popup.close();

    downloads.recentDownloadHistoryPopup.close();
  });
}

init();
