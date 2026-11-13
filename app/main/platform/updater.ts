import { app } from "electron";
import type { AppUpdater } from "electron-updater";
import { z } from "zod";

import type {
  Unsubscribe,
  UpdaterEvent,
  UpdaterPort,
} from "../../core/ports.ts";
import { messageOf } from "../../core/values.ts";

const infoSchema = z.object({ version: z.string() });
const progressSchema = z.object({ percent: z.number() });

const forward = (
  updater: AppUpdater,
  emit: (event: UpdaterEvent) => void
): void => {
  const withInfo =
    (kind: "available" | "downloaded") =>
    (info: unknown): void => {
      const parsed = infoSchema.safeParse(info);
      emit(
        parsed.success
          ? { kind, version: parsed.data.version }
          : { kind: "error", message: "The feed named no version" }
      );
    };
  updater.on("checking-for-update", () => {
    emit({ kind: "checking" });
  });
  updater.on("download-progress", (info: unknown) => {
    const parsed = progressSchema.safeParse(info);
    if (parsed.success) {
      emit({ kind: "progress", percent: parsed.data.percent });
    }
  });
  updater.on("error", (error: unknown) => {
    emit({ kind: "error", message: messageOf(error) });
  });
  updater.on("update-available", withInfo("available"));
  updater.on("update-downloaded", withInfo("downloaded"));
  updater.on("update-not-available", () => {
    emit({ kind: "notAvailable" });
  });
};

/** electron-updater's updater for this platform, reading the feed electron-builder wrote into the packaged app. */
export const createElectronUpdater = (): UpdaterPort => {
  const listeners = new Set<(event: UpdaterEvent) => void>();
  let loading: Promise<AppUpdater> | undefined;
  let loaded: AppUpdater | undefined;

  // electron-updater constructs the platform's updater when its module loads, and a run from the repository has no feed to read, so the module loads on the first call in a packaged app and never otherwise.
  const load = async (): Promise<AppUpdater> => {
    if (!app.isPackaged) {
      throw new Error("notPackaged");
    }
    loading ??= import("electron-updater").then(({ default: module }) => {
      const { autoUpdater } = module;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      forward(autoUpdater, (event) => {
        for (const listener of listeners) {
          listener(event);
        }
      });
      loaded = autoUpdater;
      return autoUpdater;
    });
    return await loading;
  };

  return {
    checkForUpdates: async ({ prerelease }) => {
      const updater = await load();
      updater.allowPrerelease = prerelease;
      await updater.checkForUpdates();
    },
    onEvent: (listener): Unsubscribe => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    quitAndInstall: () => {
      loaded?.quitAndInstall();
    },
  };
};
