import { app, dialog, type MessageBoxOptions } from "electron";
import { machineId } from "node-machine-id";
import { config } from "@/config";
import { apiClient } from "./api-client";
import { openExternalUrl } from "./url";

class LicenseKey {
	isValid = false;

	showActivationError(options: Omit<MessageBoxOptions, "type" | "message">) {
		return dialog.showMessageBox({
			type: "warning",
			message: "Failed to activate license key",
			...options,
		});
	}

	async activate(input: { licenseKey: string }) {
		const licenseKey = input.licenseKey.trim();

		const { error, isDefined } = await apiClient.v2.license.activate({
			licenseKey,
			deviceId: await machineId(),
		});

		if (error) {
			if (isDefined) {
				const errorMessages: Omit<
					Record<typeof error.code, string>,
					"MAX_DEVICE_ACTIVATIONS_REACHED"
				> = {
					LICENSE_KEY_INVALID: "This license key is invalid",
					LICENSE_DISABLED: "This license key has been disabled",
					LICENSE_EXPIRED: "This license key has expired",
				};

				if (error.code === "MAX_DEVICE_ACTIVATIONS_REACHED") {
					const { response } = await this.showActivationError({
						detail:
							"This license key has reached its maximum number of device activations. Go to the Meru Portal to remove a device linked to this license key or contact support for further help.",
						buttons: ["Open Meru Portal", "Cancel"],
						defaultId: 0,
						cancelId: 1,
					});

					if (response === 0) {
						openExternalUrl("https://portal.meru.so");
					}
				} else {
					await this.showActivationError({
						detail: `${errorMessages[error.code]}. Please use another license key or contact support for further help.`,
					});
				}
			} else {
				await this.showActivationError({
					detail: `Please try again or contact support for further help with the error: ${error.message}`,
				});
			}

			return { success: false };
		}

		config.set("licenseKey", licenseKey);

		const { response } = await dialog.showMessageBox({
			type: "info",
			message: "License key activated",
			detail: "A restart is required to apply the changes.",
			buttons: ["Restart", "Later"],
			defaultId: 0,
			cancelId: 1,
		});

		if (response === 0) {
			app.relaunch();
			app.quit();
		}

		return { success: true };
	}

	showValidationError(options: Omit<MessageBoxOptions, "type" | "message">) {
		return dialog.showMessageBox({
			type: "warning",
			message: "Failed to validate license key",
			...options,
		});
	}

	async validate() {
		const licenseKey = config.get("licenseKey");

		if (!licenseKey) {
			return true;
		}

		if (licenseKey) {
			const { error, isDefined } = await apiClient.v2.license.validate({
				licenseKey,
				deviceId: await machineId(),
			});

			if (error) {
				if (isDefined) {
					const errorMessages: Record<typeof error.code, string> = {
						LICENSE_KEY_INVALID: "The license key is invalid",
						LICENSE_DISABLED: "The license key has been disabled",
						LICENSE_EXPIRED: "The license key has expired",
						DEVICE_NOT_ACTIVATED:
							"The license key is not activated for this device",
					};

					const { response } = await this.showValidationError({
						detail: `${errorMessages[error.code]} and will be removed on this device. Contact support if you need further help.`,
						buttons: ["Continue", "Quit"],
						defaultId: 0,
						cancelId: 1,
					});

					if (response === 0) {
						config.set("licenseKey", null);

						app.relaunch();
					}
				} else {
					const { response } = await this.showValidationError({
						detail: `Please restart the app to try again or contact support for further help with the error: ${error.message}`,
						buttons: ["Restart", "Quit"],
						defaultId: 0,
						cancelId: 1,
					});

					if (response === 0) {
						app.relaunch();
					}
				}

				return false;
			}

			this.isValid = true;
		}

		return true;
	}

	async getDeviceInfo() {
		const licenseKey = config.get("licenseKey");

		if (!licenseKey) {
			throw new Error("No license key available");
		}

		const { error, data } = await apiClient.v2.license.getDeviceInfo({
			licenseKey: licenseKey,
			deviceId: await machineId(),
		});

		if (error) {
			throw new Error(`Failed to get device info: ${error.message}`);
		}

		return data;
	}

	async updateDeviceInfo(input: { label: string }) {
		const licenseKey = config.get("licenseKey");

		if (!licenseKey) {
			throw new Error("No license key available");
		}

		const { error } = await apiClient.v2.license.updateDeviceInfo({
			licenseKey: licenseKey,
			deviceId: await machineId(),
			label: input.label,
		});

		if (error) {
			throw new Error(`Failed to update device info: ${error.message}`);
		}
	}
}

export const licenseKey = new LicenseKey();
