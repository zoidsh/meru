import { app, dialog, type MessageBoxOptions } from "electron";
import { machineId } from "node-machine-id";
import { FetchError, ofetch } from "ofetch";
import { z } from "zod";
import { config } from "@/config";

class LicenseKey {
	isValid = false;

	instance = {
		name: "",
		label: "",
	};

	async activate(input: {
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

			const activationSuccessSchema = z.object({
				activated: z.literal(true),
				error: z.null(),
				licenseKey: z.object({
					key: z.string(),
				}),
			});

			const activation = activationSuccessSchema.parse(body);

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
			const showActivationError = (
				options: Omit<MessageBoxOptions, "type" | "message">,
			) => {
				return dialog.showMessageBox({
					type: "warning",
					message: "Failed to activate license key",
					...options,
				});
			};

			if (error instanceof FetchError) {
				const activationErrorSchema = z.object({
					activated: z.literal(false),
					error: z.enum([
						"license_key_invalid",
						"license_key_disabled",
						"license_key_expired",
						"max_activations_reached",
					]),
				});

				const activationError = activationErrorSchema.safeParse(error.data);

				if (!activationError.success) {
					await showActivationError({
						detail: `Please try again or contact support for further help with the error: ${error.message}`,
					});
				} else {
					switch (activationError.data.error) {
						case "license_key_invalid":
							await showActivationError({
								detail:
									"This license key is invalid. Please try another license key or contact support for further help.",
							});

							break;
						case "license_key_disabled":
							await showActivationError({
								detail:
									"This license key is disabled. Please try another license key or contact support for further help.",
							});

							break;
						case "license_key_expired":
							await showActivationError({
								detail:
									"This license key is expired. Please try another license key or contact support for further help.",
							});

							break;
						case "max_activations_reached": {
							const { response } = await showActivationError({
								detail:
									"This license key is already activated on another device. Do you want to deactivate the other device and try again?",
								buttons: ["Confirm", "Cancel"],
								defaultId: 0,
								cancelId: 1,
							});

							if (response === 0) {
								return this.activate({
									licenseKey: input.licenseKey,
									force: true,
								});
							}

							break;
						}
					}
				}
			} else {
				await showActivationError({
					detail: `Please try again or contact support for further help with the error: ${error instanceof Error ? error.message : error}`,
				});
			}

			return { success: false };
		}
	}

	async validate(): Promise<boolean> {
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

				const validationSuccessSchema = z.object({
					valid: z.literal(true),
					error: z.null(),
					licenseKey: z.object({
						key: z.string(),
					}),
					instance: z.object({
						name: z.string(),
						label: z.string(),
					}),
				});

				validationSuccessSchema.parse(body);

				this.instance = body.instance;

				this.isValid = true;
			}

			return true;
		} catch (error) {
			const showValidationError = (
				options: Omit<MessageBoxOptions, "type" | "message">,
			) => {
				return dialog.showMessageBox({
					type: "warning",
					message: "Failed to validate license key",
					...options,
				});
			};

			if (error instanceof FetchError) {
				const validationErrorSchema = z.object({
					valid: z.literal(false),
					error: z.enum([
						"license_key_invalid",
						"license_key_expired",
						"license_key_disabled",
						"license_key_not_activated_for_instance",
					]),
				});

				const validationErrorMessages: Record<
					z.infer<typeof validationErrorSchema>["error"],
					string
				> = {
					license_key_invalid: "The license key is invalid",
					license_key_disabled: "The license key has been disabled",
					license_key_expired: "The license key has expired",
					license_key_not_activated_for_instance:
						"The license key is activated on another device",
				};

				const validationError = validationErrorSchema.safeParse(error.data);

				if (validationError.success) {
					const { response } = await showValidationError({
						detail: `${validationErrorMessages[validationError.data.error]}. Please use another license key or contact support for further help. Please remove the license to continue.`,
						buttons: ["Remove License", "Quit"],
						defaultId: 0,
						cancelId: 1,
					});

					if (response === 0) {
						config.set("licenseKey", null);

						app.relaunch();
					}

					return false;
				}
			}

			const { response } = await showValidationError({
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
}

export const licenseKey = new LicenseKey();
