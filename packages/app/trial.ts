import { app, dialog } from "electron";
import { machineId } from "node-machine-id";
import { ofetch } from "ofetch";
import { z } from "zod";
import { config } from "./config";
import { ipc } from "./ipc";
import { main } from "./main";
import { appState } from "./state";
import { openExternalUrl } from "./url";

const validateTrialSuccessSchema = z.object({
	daysLeft: z.number(),
	expired: z.boolean(),
	error: z.null(),
});

class Trial {
	private validationInterval: Timer | undefined;

	daysLeft = 0;

	async validate() {
		if (appState.isLicenseKeyValid || config.get("trial.expired")) {
			return;
		}

		try {
			const body = await ofetch(
				`${process.env.MERU_API_URL}/v1/licenses/trial`,
				{
					method: "POST",
					body: {
						instanceName: await machineId(),
					},
				},
			);

			const trial = validateTrialSuccessSchema.parse(body);

			if (trial.expired) {
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

				return;
			}

			if (this.validationInterval) {
				this.setDaysLeft(trial.daysLeft);

				return;
			}

			appState.isLicenseKeyValid = true;

			this.daysLeft = trial.daysLeft;

			this.validationInterval = setInterval(
				() => {
					this.validate();
				},
				1000 * 60 * 60 * 3,
			);
		} catch (error) {
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
