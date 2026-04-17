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
        message: "Failed to validate Meru Pro trial",
        detail: (await isOnline())
          ? `Please restart the app to try again or contact support for further help with the error: ${error.message} (${error.cause}) - Hint: Could a VPN or firewall block the connection?`
          : "It seems you are currently offline. Please connect to the internet and restart the app to try again.",
        buttons: ["Restart", "Quit"],
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
        message: "Your Meru Pro trial has ended",
        detail: "Upgrade to Pro to keep using all features or continue with the free version.",
        buttons: ["Upgrade to Pro", "Continue with Free", "Quit"],
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
