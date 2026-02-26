import { platform } from "@electron-toolkit/utils";
import { APP_ID } from "@meru/shared/constants";
import { app } from "electron";
import { accounts } from "@/accounts";
import { blocker } from "@/blocker";
import { config } from "@/config";
import { downloads } from "@/downloads";
import { ipc } from "@/ipc";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { appState } from "@/state";
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
import { trial } from "./trial";

(async () => {
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

  if (config.get("hardwareAcceleration") === false) {
    app.disableHardwareAcceleration();
  }

  if (config.get("resetConfig")) {
    config.clear();

    app.relaunch();

    app.quit();

    return;
  }

  if (!(await licenseKey.validate())) {
    app.quit();

    return;
  }

  if (!(await trial.validate())) {
    app.quit();

    return;
  }

  downloads.init();

  await Promise.all([app.whenReady(), blocker.init()]);

  theme.init();

  accounts.init();

  main.init();

  main.loadURL();

  accounts.createViews();

  ipc.init();

  appMenu.init();

  appTray.init();

  appUpdater.init();

  doNotDisturb.init();

  if (!platform.isMacOS) {
    if (PROCESS_MAILTO_URL_ARG) {
      handleMailtoUrl(PROCESS_MAILTO_URL_ARG);
    } else if (PROCESS_MERU_URL_ARG) {
      handleMeruUrl(PROCESS_MERU_URL_ARG);
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
    }
  });

  app.on("activate", () => {
    main.show();
  });

  if (platform.isMacOS) {
    app.on("open-url", (_event, url) => {
      if (isMailtoUrl(url)) {
        handleMailtoUrl(url);
      }

      if (isMeruUrl(url)) {
        handleMeruUrl(url);
      }
    });
  }

  if (!app.commandLine.hasSwitch("disable-bring-to-top-on-focus")) {
    main.window.on("focus", () => {
      if (!appState.isSettingsOpen) {
        accounts.getSelectedAccount().instance.gmail.view.webContents.focus();
      }
    });
  }

  app.on("before-quit", () => {
    if (!appState.isQuittingApp) {
      main.saveWindowState();

      appState.isQuittingApp = true;
    }
  });
})();
