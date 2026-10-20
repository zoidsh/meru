import { t } from "@lingui/core/macro";
import { app, dialog, type MessageBoxOptions } from "electron";
import isOnline from "is-online";
import { serializeError } from "serialize-error";
import { config } from "@/config";
import { getMachineId } from "@/lib/machine-id";
import { relaunchApp } from "@/lib/relaunch";
import { apiClient, apiFallbackClient } from "./api-client";
import { log } from "./lib/log";
import { openExternalUrl } from "./url";

class LicenseKey {
  isValid = false;

  /*
   * Preloads a key rather than granting anything: it is validated against the
   * API on every launch like any other, and a device that was never activated
   * is refused with `DEVICE_NOT_ACTIVATED`. That is what lets a fleet or an MDM
   * deployment hand Meru its license instead of someone typing it in.
   *
   * Outside production the variable is the only source: a run without it
   * removes the stored key, so a profile once run licensed comes up on its
   * trial again. Only the local key goes; the device stays activated, and the
   * next licensed run validates as before. `scripts/build.ts` defines
   * `NODE_ENV` as production in every build but a development run, so no
   * shipped app ever removes a key.
   */
  init() {
    const environmentKey = process.env.MERU_LICENSE_KEY || null;

    if (!environmentKey && process.env.NODE_ENV === "production") {
      return;
    }

    // A launch that changes nothing must not fire `config.onDidChange`
    if (config.get("licenseKey") === environmentKey) {
      return;
    }

    config.set("licenseKey", environmentKey);
  }

  showActivationError(options: Omit<MessageBoxOptions, "type" | "message">) {
    return dialog.showMessageBox({
      type: "warning",
      message: t`Couldn't activate the license key.`,
      ...options,
    });
  }

  async activate(
    input: { licenseKey: string },
    { useFallback }: { useFallback?: boolean } = {},
  ): Promise<{ success: boolean }> {
    const licenseKey = input.licenseKey.trim();

    const { error, isDefined } = await (
      useFallback ? apiFallbackClient : apiClient
    ).v2.license.activate({
      licenseKey,
      deviceId: await getMachineId(),
    });

    if (error) {
      if (isDefined) {
        const errorMessages: Omit<
          Record<typeof error.code, string>,
          "MAX_DEVICE_ACTIVATIONS_REACHED"
        > = {
          LICENSE_KEY_INVALID: t`This license key is invalid. Use another license key, or contact support.`,
          LICENSE_DISABLED: t`This license key has been disabled. Use another license key, or contact support.`,
          LICENSE_EXPIRED: t`This license key has expired. Use another license key, or contact support.`,
        };

        if (error.code === "MAX_DEVICE_ACTIVATIONS_REACHED") {
          const { response } = await this.showActivationError({
            detail: t`This license key is activated on the maximum number of devices. Remove one in the Meru Portal, or contact support.`,
            buttons: [t`Open Meru Portal`, t`Cancel`],
            defaultId: 0,
            cancelId: 1,
          });

          if (response === 0) {
            openExternalUrl("https://portal.meru.so");
          }
        } else {
          await this.showActivationError({
            detail: errorMessages[error.code],
          });
        }
      } else {
        if (!useFallback) {
          log.error("Failed to activate license key, retrying with fallback API client", {
            error: serializeError(error),
          });

          return this.activate(input, { useFallback: true });
        }

        log.error("Failed to activate license key", { error: serializeError(error) });

        const errorMessage = error.message;

        // A missing cause reads `undefined`, as a template literal writes it,
        // where the macro would leave the parentheses empty.
        const errorCause = String(error.cause);

        await this.showActivationError({
          detail: (await isOnline())
            ? t({
                message: `Try again, or contact support. A VPN or a firewall can block the connection.\n\n${errorMessage} (${errorCause})`,
                comment: "errorMessage and errorCause are the technical reason, left untranslated",
              })
            : t`Meru can't reach the internet. Connect and try again.`,
        });
      }

      return { success: false };
    }

    config.set("licenseKey", licenseKey);

    const { response } = await dialog.showMessageBox({
      type: "info",
      message: t`License key activated.`,
      detail: t`Restart Meru to apply the changes.`,
      buttons: [
        t({ message: "Restart", comment: "Dialog button that restarts Meru" }),
        t({ message: "Later", comment: "Dialog button that puts off restarting Meru" }),
      ],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      relaunchApp();
      app.quit();
    }

    return { success: true };
  }

  showValidationError(options: Omit<MessageBoxOptions, "type" | "message">) {
    return dialog.showMessageBox({
      type: "warning",
      message: t`Couldn't validate the license key.`,
      ...options,
    });
  }

  async validate({ useFallback }: { useFallback?: boolean } = {}): Promise<boolean> {
    const licenseKey = config.get("licenseKey");

    if (!licenseKey) {
      return true;
    }

    const { error, isDefined } = await (
      useFallback ? apiFallbackClient : apiClient
    ).v2.license.validate({
      licenseKey,
      deviceId: await getMachineId(),
    });

    if (error) {
      if (isDefined) {
        const errorMessages: Record<typeof error.code, string> = {
          LICENSE_KEY_INVALID: t`This license key is invalid. Contact support if you need help.`,
          LICENSE_DISABLED: t`This license key has been disabled. Contact support if you need help.`,
          LICENSE_EXPIRED: t`This license key has expired. Contact support if you need help.`,
          DEVICE_NOT_ACTIVATED: t`This license key isn't activated for this device. Contact support if you need help.`,
        };

        const { response } = await this.showValidationError({
          detail: errorMessages[error.code],
          buttons: [
            t({
              message: "Remove and restart",
              comment: "Button that removes the license key from Meru and restarts it",
            }),
            t({ message: "Quit", comment: "Dialog button that quits Meru" }),
          ],
          defaultId: 0,
          cancelId: 1,
        });

        if (response === 0) {
          config.set("licenseKey", null);

          relaunchApp();
        }
      } else {
        if (!useFallback) {
          log.error("Failed to validate license key, retrying with fallback API client", {
            error: serializeError(error),
          });

          return this.validate({ useFallback: true });
        }

        log.error("Failed to validate license key", { error: serializeError(error) });

        const errorMessage = error.message;

        // A missing cause reads `undefined`, as a template literal writes it,
        // where the macro would leave the parentheses empty.
        const errorCause = String(error.cause);

        const { response } = await this.showValidationError({
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
      }

      return false;
    }

    this.isValid = true;

    return true;
  }

  async getDeviceInfo({ useFallback }: { useFallback?: boolean } = {}): Promise<{
    label: string;
  }> {
    const licenseKey = config.get("licenseKey");

    if (!licenseKey) {
      throw new Error("No license key available");
    }

    const { error, data } = await (
      useFallback ? apiFallbackClient : apiClient
    ).v2.license.getDeviceInfo({
      licenseKey: licenseKey,
      deviceId: await getMachineId(),
    });

    if (error) {
      if (!useFallback) {
        log.error("Failed to get device info, retrying with fallback API client", {
          error: serializeError(error),
        });

        return this.getDeviceInfo({ useFallback: true });
      }

      log.error("Failed to get device info", { error: serializeError(error) });

      throw new Error(`Failed to get device info: ${error.message}`);
    }

    return data;
  }

  async updateDeviceInfo(
    input: { label: string },
    { useFallback }: { useFallback?: boolean } = {},
  ): Promise<void> {
    const licenseKey = config.get("licenseKey");

    if (!licenseKey) {
      throw new Error("No license key available");
    }

    const { error } = await (
      useFallback ? apiFallbackClient : apiClient
    ).v2.license.updateDeviceInfo({
      licenseKey: licenseKey,
      deviceId: await getMachineId(),
      label: input.label,
    });

    if (error) {
      if (!useFallback) {
        log.error("Failed to update device info, retrying with fallback API client", {
          error: serializeError(error),
        });

        return this.updateDeviceInfo(input, { useFallback: true });
      }

      log.error("Failed to update device info", { error: serializeError(error) });

      throw new Error(`Failed to update device info: ${error.message}`);
    }
  }
}

export const licenseKey = new LicenseKey();
