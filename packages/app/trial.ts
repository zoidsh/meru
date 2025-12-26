import { app, dialog } from "electron";
import { machineId } from "node-machine-id";
import { apiClient } from "./api-client";
import { config } from "./config";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { openExternalUrl } from "./url";

class Trial {
	private validationInterval: Timer | undefined;

	daysLeft = 0;

	async validate(): Promise<boolean> {
		if (licenseKey.isValid || config.get("trial.expired")) {
			return true;
		}

		const { error, data } = await apiClient.v2.license.trial({
			deviceId: await machineId(),
		});

		if (error) {
			const { response } = await dialog.showMessageBox({
				type: "error",
				message: "Failed to validate Meru Pro trial",
				detail: `Please restart the app to try again or contact support for further help with the error: ${error instanceof Error ? error.message : error}`,
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
				detail:
					"Upgrade to Pro to keep using all features or continue with the free version.",
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

		ipc.renderer.send(
			main.window.webContents,
			"trial.daysLeftChanged",
			daysLeft,
		);
	}
}

export const trial = new Trial();
