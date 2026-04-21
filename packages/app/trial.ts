import { t } from "@meru/i18n";
import { app, dialog } from "electron";
import { machineId } from "node-machine-id";
import { apiClient, apiFallbackClient } from "./api-client";
import { config } from "./config";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { openExternalUrl } from "./url";
import isOnline from "is-online";
import log from "electron-log";
import { serializeError } from "serialize-error";

class Trial {
  private validationInterval: NodeJS.Timeout | undefined;

  daysLeft = 0;

  async validate({ useFallback }: { useFallback?: boolean } = {}): Promise<boolean> {
    if (licenseKey.isValid || config.get("trial.expired")) {
      return true;
    }

    const { error, data } = await (useFallback ? apiFallbackClient : apiClient).v2.license.trial({
      deviceId: await machineId(),
    });

    if (error) {
      if (!useFallback) {
        log.error("Failed to validate trial, retrying with fallback API client", {
          error: serializeError(error),
        });

        return this.validate({ useFallback: true });
      }

      log.error("Failed to validate trial", { error: serializeError(error) });

      const { response } = await dialog.showMessageBox({
        type: "error",
        message: t("trial.validationFailed.message"),
        detail: (await isOnline())
          ? t("trial.validationFailed.detailOnline", {
              message: error.message,
              cause: error.cause,
            })
          : t("trial.validationFailed.detailOffline"),
        buttons: [t("trial.validationFailed.restart"), t("trial.validationFailed.quit")],
        defaultId: 0,
        cancelId: 1,
      });

      if (response === 0) {
        app.relaunch();
      }

      return false;
    }

    if (data.expired) {
      if (this.validationInterval) {
        clearInterval(this.validationInterval);

        this.validationInterval = undefined;
      }

      config.set("trial.expired", true);

      const { response } = await dialog.showMessageBox({
        type: "info",
        message: t("trial.expired.message"),
        detail: t("trial.expired.detail"),
        buttons: [
          t("trial.expired.upgradeToPro"),
          t("trial.expired.continueWithFree"),
          t("trial.expired.quit"),
        ],
        defaultId: 0,
        cancelId: 2,
      });

      if (response === 0) {
        openExternalUrl("https://meru.so/#pricing", true);
      }

      if (response === 2) {
        return false;
      }

      return true;
    }

    if (this.validationInterval) {
      this.setDaysLeft(data.daysLeft);

      return true;
    }

    licenseKey.isValid = true;

    this.daysLeft = data.daysLeft;

    this.validationInterval = setInterval(
      () => {
        this.validate();
      },
      1000 * 60 * 60 * 3,
    );

    return true;
  }

  setDaysLeft(daysLeft: number) {
    this.daysLeft = daysLeft;

    ipc.renderer.send(main.window.webContents, "trial.daysLeftChanged", daysLeft);
  }
}

export const trial = new Trial();
