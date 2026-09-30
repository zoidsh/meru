import { dialog } from "electron";
import isOnline from "is-online";
import { serializeError } from "serialize-error";
import { getMachineId } from "@/lib/machine-id";
import { relaunchApp } from "@/lib/relaunch";
import { apiClient, apiFallbackClient } from "./api-client";
import { config } from "./config";
import { ipc } from "./ipc";
import { log } from "./lib/log";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { openExternalUrl } from "./url";

class Trial {
  private validationInterval: NodeJS.Timeout | undefined;

  daysLeft = 0;

  async validate({ useFallback }: { useFallback?: boolean } = {}): Promise<boolean> {
    if (licenseKey.isValid) {
      return true;
    }

    /*
     * Outside production the trial follows `MERU_DEV_DEVICE_ID` alone, as the
     * license follows `MERU_LICENSE_KEY`: without it a run is the free version
     * and asks the API nothing, whatever the machine's own trial or the
     * profile's stored expiry says. `scripts/build.ts` defines `NODE_ENV` as
     * production in every build but a development run.
     */
    if (
      process.env.NODE_ENV === "production"
        ? config.get("trial.expired")
        : !process.env.MERU_DEV_DEVICE_ID
    ) {
      return true;
    }

    const { error, data } = await (useFallback ? apiFallbackClient : apiClient).v2.license.trial({
      deviceId: await getMachineId(),
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
        message: "Couldn't validate your Meru Pro trial.",
        detail: (await isOnline())
          ? `Restart Meru to try again, or contact support. A VPN or a firewall can block the connection.\n\n${error.message} (${error.cause})`
          : "Meru can't reach the internet. Connect, then restart Meru to try again.",
        buttons: ["Restart", "Quit"],
        defaultId: 0,
        cancelId: 1,
      });

      if (response === 0) {
        relaunchApp();
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
        message: "Your Meru Pro trial has ended.",
        detail: "Upgrade to Meru Pro to keep every feature, or continue with the free version.",
        buttons: ["Upgrade to Meru Pro", "Continue with the free version", "Quit"],
        defaultId: 0,
        cancelId: 2,
      });

      if (response === 0) {
        openExternalUrl("https://meru.so/#pricing", { skipTrustedHostCheck: true });
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
