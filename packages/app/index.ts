import { platform } from "@electron-toolkit/utils";
import { APP_ID } from "@meru/shared/constants";
import { app, session } from "electron";
import { accounts } from "@/accounts";
import { blocker } from "@/blocker";
import { bookmarks } from "@/bookmarks";
import { config } from "@/config";
import { downloads } from "@/downloads";
import { extensionActions } from "@/extension-actions";
import { extensions, extensionUpdater, pruneDerivedExtensionCopies } from "@/extensions";
import { ipc } from "@/ipc";
import { initLinuxWindowControls } from "@/lib/linux";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { theme } from "@/theme";
import { appTray } from "@/tray";
import { appUpdater } from "@/updater";
import { doNotDisturb } from "./do-not-disturb";
import {
  findMailtoUrlArg,
  findMeruUrlArg,
  handleMailtoUrl,
  handleMeruUrl,
  isMailtoUrl,
  isMeruUrl,
  PROCESS_MAILTO_URL_ARG,
  PROCESS_MERU_URL_ARG,
  setMeruProtocolClient,
} from "./protocol";
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

  config.clear();

  app.relaunch();

  app.quit();
}

async function init() {
  if (platform.isLinux) {
    app.commandLine.appendSwitch("gtk-version", "3");
    app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
  }

  if (platform.isWindows) {
    app.setAppUserModelId(APP_ID);
  }

  // The team id is only known to signed builds, and without it the keychain
  // access group can't match the `keychain-access-groups` entitlement
  if (platform.isMacOS && process.env.APPLE_TEAM_ID) {
    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup: `${process.env.APPLE_TEAM_ID}.${APP_ID}.webauthn`,
      },
    });
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

  if (!(await licenseKey.validate())) {
    app.quit();

    return;
  }

  if (!(await trial.validate())) {
    app.quit();

    return;
  }

  blocker.init();

  spellchecker.init();

  accounts.init();

  await initLinuxWindowControls();

  main.init();

  main.loadURL();

  void accounts.createViews();

  ipc.init();

  extensionActions.init();

  theme.init();

  appMenu.init();

  appTray.init();

  appUpdater.init();

  extensionUpdater.init();

  void pruneDerivedExtensionCopies();

  doNotDisturb.init();

  if (!platform.isMacOS) {
    if (PROCESS_MAILTO_URL_ARG) {
      void handleMailtoUrl(PROCESS_MAILTO_URL_ARG);
    } else if (PROCESS_MERU_URL_ARG) {
      handleMeruUrl(PROCESS_MERU_URL_ARG);
    }
  }

  app.on("second-instance", (_event, argv) => {
    main.show();

    if (!platform.isMacOS) {
      const mailtoUrlArg = findMailtoUrlArg(argv);

      if (mailtoUrlArg) {
        void handleMailtoUrl(mailtoUrlArg);

        return;
      }

      const meruUrlArg = findMeruUrlArg(argv);

      if (meruUrlArg) {
        handleMeruUrl(meruUrlArg);

        return;
      }
    }
  });

  app.on("activate", () => {
    main.show();
  });

  if (platform.isMacOS) {
    app.on("did-become-active", () => {
      if (!main.window.isVisible()) {
        main.show();
      }
    });

    app.on("open-url", (_event, url) => {
      if (isMailtoUrl(url)) {
        void handleMailtoUrl(url);
      }

      if (isMeruUrl(url)) {
        main.show();

        handleMeruUrl(url);
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

    extensionActions.popup.close();
  });
}

void init();
