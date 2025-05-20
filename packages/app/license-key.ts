import { config } from "@/config";
import { appState } from "@/state";
import { type MessageBoxOptions, app, dialog } from "electron";
import { machineId } from "node-machine-id";
import { FetchError, ofetch } from "ofetch";
import { z } from "zod";

const licenseKeyActivationSuccessSchema = z.object({
	activated: z.literal(true),
	error: z.null(),
	licenseKey: z.object({
		key: z.string(),
	}),
});

const licenseKeyActivationErrorSchema = z.object({
	activated: z.literal(false),
	error: z.enum([
		"license_key_invalid",
		"license_key_disabled",
		"license_key_expired",
		"max_activations_reached",
	]),
});

function showLicenseKeyActivationError(
	options: Omit<MessageBoxOptions, "type" | "message">,
) {
	return dialog.showMessageBox({
		type: "warning",
		message: "Failed to activate license key",
		...options,
	});
}

export async function activateLicenseKey(input: {
	licenseKey: string;
	force?: boolean;
}): Promise<{ success: boolean }> {
	try {
		const body = await ofetch(
			`${process.env.MERU_API_URL}/v1/licenses/activate`,
			{
				method: "POST",
				body: {
					licenseKey: input.licenseKey.trim(),
					instanceName: await machineId(),
					force: input.force,
				},
			},
		);

		const activation = licenseKeyActivationSuccessSchema.parse(body);

		config.set("licenseKey", activation.licenseKey.key);

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
	} catch (error) {
		if (error instanceof FetchError) {
			const activationError = licenseKeyActivationErrorSchema.safeParse(
				error.data,
			);

			if (!activationError.success) {
				await showLicenseKeyActivationError({
					detail: `Please try again or contact support for further help with the error: ${error.message}`,
				});
			} else {
				switch (activationError.data.error) {
					case "license_key_invalid":
						await showLicenseKeyActivationError({
							detail:
								"This license key is invalid. Please try another license key or contact support for further help.",
						});

						break;
					case "license_key_disabled":
						await showLicenseKeyActivationError({
							detail:
								"This license key is disabled. Please try another license key or contact support for further help.",
						});

						break;
					case "license_key_expired":
						await showLicenseKeyActivationError({
							detail:
								"This license key is expired. Please try another license key or contact support for further help.",
						});

						break;
					case "max_activations_reached": {
						const { response } = await showLicenseKeyActivationError({
							detail:
								"This license key is already activated on another device. Do you want to deactivate the other device and try again?",
							buttons: ["Confirm", "Cancel"],
							defaultId: 0,
							cancelId: 1,
						});

						if (response === 0) {
							return activateLicenseKey({
								licenseKey: input.licenseKey,
								force: true,
							});
						}

						break;
					}
				}
			}
		} else {
			await showLicenseKeyActivationError({
				detail: `Please try again or contact support for further help with the error: ${error instanceof Error ? error.message : error}`,
			});
		}

		return { success: false };
	}
}

const licenseKeyValidationSuccessSchema = z.object({
	valid: z.literal(true),
	error: z.null(),
	licenseKey: z.object({
		key: z.string(),
	}),
});

const licenseKeyValidationErrorSchema = z.object({
	valid: z.literal(false),
	error: z.enum([
		"license_key_invalid",
		"license_key_expired",
		"license_key_disabled",
		"license_key_not_activated_for_instance",
	]),
});

const licenseKeyValidationErrorMessages: Record<
	z.infer<typeof licenseKeyValidationErrorSchema>["error"],
	string
> = {
	license_key_invalid: "The license key is invalid",
	license_key_disabled: "The license key has been disabled",
	license_key_expired: "The license key has expired",
	license_key_not_activated_for_instance:
		"The license key is activated on another device",
};

function showLicenseKeyValidationError(
	options: Omit<MessageBoxOptions, "type" | "message">,
) {
	return dialog.showMessageBox({
		type: "warning",
		message: "Failed to validate license key",
		...options,
	});
}

export async function validateLicenseKey() {
	try {
		const licenseKey = config.get("licenseKey");

		if (licenseKey) {
			const body = await ofetch(
				`${process.env.MERU_API_URL}/v1/licenses/validate`,
				{
					method: "POST",
					body: {
						licenseKey,
						instanceName: await machineId(),
					},
				},
			);

			licenseKeyValidationSuccessSchema.parse(body);

			appState.isLicenseKeyValid = true;
		}
	} catch (error) {
		if (error instanceof FetchError) {
			const validationError = licenseKeyValidationErrorSchema.safeParse(
				error.data,
			);

			if (validationError.success) {
				const { response } = await showLicenseKeyValidationError({
					detail: `${licenseKeyValidationErrorMessages[validationError.data.error]}. Please use another license key or contact support for further help. Please remove the license to continue.`,
					buttons: ["Remove License", "Quit"],
					defaultId: 0,
					cancelId: 1,
				});

				if (response === 0) {
					config.set("licenseKey", null);

					app.relaunch();
				}

				return "failed";
			}
		}

		const { response } = await showLicenseKeyValidationError({
			detail: `Please restart the app to try again or contact support for further help with the error: ${error instanceof Error ? error.message : error}`,
			buttons: ["Restart", "Quit"],
			defaultId: 0,
			cancelId: 1,
		});

		if (response === 0) {
			app.relaunch();
		}

		return "failed";
	}
}
