import { app, dialog } from "electron";
import { machineId } from "node-machine-id";
import { ofetch } from "ofetch";
import { z } from "zod";
import { config } from "./config";
import { appState } from "./state";
import { openExternalUrl } from "./url";

const validateTrialSuccessSchema = z.object({
	daysLeft: z.number(),
	expired: z.boolean(),
	error: z.null(),
});

let validateTrialInterval: Timer | undefined;

export async function validateTrial() {
	if (appState.isValidLicenseKey || config.get("trial.expired")) {
		return;
	}

	try {
		const body = await ofetch(`${process.env.MERU_API_URL}/v1/licenses/trial`, {
			method: "POST",
			body: {
				instanceName: await machineId(),
			},
		});

		const trial = validateTrialSuccessSchema.parse(body);

		if (trial.expired) {
			config.set("trial.expired", true);

			const { response } = await dialog.showMessageBox({
				type: "info",
				message: "Your Meru Pro trial has ended",
				detail:
					"Upgrade to Pro to continue using all features or continue with the free version.",
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

		if (validateTrialInterval) {
			appState.setTrialDaysLeft(trial.daysLeft);
		} else {
			appState.trialDaysLeft = trial.daysLeft;

			validateTrialInterval = setInterval(
				() => {
					validateTrial();
				},
				1000 * 60 * 60 * 3,
			);
		}
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
