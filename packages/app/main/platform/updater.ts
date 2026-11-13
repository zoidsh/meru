import electronUpdater from "electron-updater";
import { z } from "zod";

import type {
  Unsubscribe,
  UpdaterEvent,
  UpdaterPort,
} from "../../core/ports.ts";

const infoSchema = z.object({ version: z.string() });
const progressSchema = z.object({ percent: z.number() });

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** electron-updater's updater for this platform, reading the feed electron-builder wrote into the packaged app. */
export const createElectronUpdater = (): UpdaterPort => {
  // Reading autoUpdater constructs the platform's updater, so it is read here rather than at import.
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  return {
    checkForUpdates: async ({ prerelease }) => {
      autoUpdater.allowPrerelease = prerelease;
      await autoUpdater.checkForUpdates();
    },
    downloadUpdate: async () => {
      await autoUpdater.downloadUpdate();
    },
    onEvent: (listener): Unsubscribe => {
      const emit = (event: UpdaterEvent) => {
        listener(event);
      };
      const withInfo =
        (kind: "available" | "downloaded") =>
        (info: unknown): void => {
          const parsed = infoSchema.safeParse(info);
          emit(
            parsed.success
              ? { kind, version: parsed.data.version }
              : { kind: "error", message: `The feed named no version` }
          );
        };
      const checking = () => {
        emit({ kind: "checking" });
      };
      const progress = (info: unknown) => {
        const parsed = progressSchema.safeParse(info);
        if (parsed.success) {
          emit({ kind: "progress", percent: parsed.data.percent });
        }
      };
      const failed = (error: unknown) => {
        emit({ kind: "error", message: describe(error) });
      };
      const available = withInfo("available");
      const downloaded = withInfo("downloaded");
      const notAvailable = () => {
        emit({ kind: "notAvailable" });
      };
      autoUpdater.on("checking-for-update", checking);
      autoUpdater.on("download-progress", progress);
      autoUpdater.on("error", failed);
      autoUpdater.on("update-available", available);
      autoUpdater.on("update-downloaded", downloaded);
      autoUpdater.on("update-not-available", notAvailable);
      return () => {
        autoUpdater.off("checking-for-update", checking);
        autoUpdater.off("download-progress", progress);
        autoUpdater.off("error", failed);
        autoUpdater.off("update-available", available);
        autoUpdater.off("update-downloaded", downloaded);
        autoUpdater.off("update-not-available", notAvailable);
      };
    },
    quitAndInstall: () => {
      autoUpdater.quitAndInstall();
    },
  };
};
