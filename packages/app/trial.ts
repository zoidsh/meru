import { t } from "@lingui/core/macro";
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
  private checkInterval: NodeJS.Timeout | undefined;

  daysLeft = 0;

  /*
   * Set when the periodic check finds the trial over. Pro stays on until the
   * next launch, which then takes the stored `trial.expired` and starts free.
   */
  expired = false;

  async validate(): Promise<boolean> {
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

    const { error, data } = await this.request();

    if (error) {
      const errorMessage = error.message;

      // A missing cause reads `undefined`, as a template literal writes it,
      // where the macro would leave the parentheses empty.
      const errorCause = String(error.cause);

      const { response } = await dialog.showMessageBox({
        type: "error",
        message: t`Couldn't validate your Meru Pro trial.`,
        detail: (await isOnline())
          ? t({
              message: `Restart Meru to try again, or contact support. A VPN or a firewall can block the connection.\n\n${errorMessage} (${errorCause})`,
              comment: "errorMessage and errorCause are the technical reason, left untranslated",
            })
          : t`Meru can't reach the internet. Connect, then restart Meru to try again.`,
        buttons: [
          t({ message: "Restart", comment: "Dialog button that restarts Meru" }),
          t({ message: "Quit", comment: "Dialog button that quits Meru" }),
        ],
        defaultId: 0,
        cancelId: 1,
      });

      if (response === 0) {
        relaunchApp();
      }

      return false;
    }

    if (data.expired) {
      config.set("trial.expired", true);

      const { response } = await dialog.showMessageBox({
        type: "info",
        message: t`Your Meru Pro trial has ended.`,
        detail: t`Upgrade to Meru Pro to keep every feature, or continue with the free version.`,
        buttons: [
          t`Upgrade to Meru Pro`,
          t`Continue with the free version`,
          t({ message: "Quit", comment: "Dialog button that quits Meru" }),
        ],
        defaultId: 0,
        cancelId: 2,
      });

      if (response === 0) {
        openPricing();
      }

      return response !== 2;
    }

    licenseKey.isValid = true;

    this.daysLeft = data.daysLeft;

    this.checkInterval = setInterval(
      () => {
        this.check();
      },
      1000 * 60 * 60 * 3,
    );

    return true;
  }

  // A failure here is silent: nothing changes before the next launch, which
  // validates again and owns the dialogs.
  private async check() {
    const { error, data } = await this.request();

    if (error) {
      return;
    }

    if (!data.expired) {
      this.daysLeft = data.daysLeft;

      this.sendChanged();

      return;
    }

    clearInterval(this.checkInterval);

    this.checkInterval = undefined;

    this.daysLeft = 0;

    this.expired = true;

    config.set("trial.expired", true);

    this.sendChanged();

    const { response } = await dialog.showMessageBox(main.window, {
      type: "info",
      message: t`Your Meru Pro trial has ended.`,
      detail: t`Meru Pro features stay on until you quit Meru. After that, Meru continues with the free version unless you upgrade.`,
      buttons: [
        t`Upgrade to Meru Pro`,
        t({ message: "Not now", comment: "Dialog button that dismisses the end-of-trial message" }),
      ],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      openPricing();
    }
  }

  private async request() {
    const deviceId = await getMachineId();

    const result = await apiClient.v2.license.trial({ deviceId });

    if (!result.error) {
      return result;
    }

    log.error("Failed to validate trial, retrying with fallback API client", {
      error: serializeError(result.error),
    });

    const fallbackResult = await apiFallbackClient.v2.license.trial({ deviceId });

    if (fallbackResult.error) {
      log.error("Failed to validate trial", { error: serializeError(fallbackResult.error) });
    }

    return fallbackResult;
  }

  private sendChanged() {
    ipc.renderer.send(main.window.webContents, "trial.changed", {
      daysLeft: this.daysLeft,
      expired: this.expired,
    });
  }
}

function openPricing() {
  openExternalUrl("https://meru.so/#pricing", { skipTrustedHostCheck: true });
}

export const trial = new Trial();
