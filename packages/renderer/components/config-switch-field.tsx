import type { Config } from "@meru/shared/types";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@meru/ui/components/field";
import { Switch } from "@meru/ui/components/switch";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { LicenseKeyRequiredFieldBadge } from "./license-key-required-field-badge";

export function ConfigSwitchField({
	configKey,
	label,
	description,
	licenseKeyRequired,
	disabled,
	restartRequired,
}: {
	configKey: keyof Config;
	label: string;
	description: string;
	licenseKeyRequired?: boolean;
	disabled?: boolean;
	restartRequired?: boolean;
}) {
	const { config } = useConfig();

	const configMutation = useConfigMutation({
		onSuccess: () => {
			if (restartRequired) {
				restartRequiredToast();
			}
		},
	});

	const isLicenseKeyValid = useIsLicenseKeyValid();

	if (!config) {
		return;
	}

	const checked = config[configKey];

	if (typeof checked !== "boolean") {
		throw new Error(
			`ConfigSwitchField: Config key "${configKey}" is not a boolean`,
		);
	}

	return (
		<Field orientation="horizontal">
			<FieldContent>
				<FieldLabel htmlFor={configKey} className="flex items-center gap-2">
					{label}
					{licenseKeyRequired && <LicenseKeyRequiredFieldBadge />}
				</FieldLabel>
				<FieldDescription>{description}</FieldDescription>
			</FieldContent>
			<Switch
				id={configKey}
				checked={
					disabled
						? false
						: licenseKeyRequired && !isLicenseKeyValid
							? false
							: checked
				}
				disabled={disabled || (licenseKeyRequired && !isLicenseKeyValid)}
				onCheckedChange={(checked) => {
					configMutation.mutate({
						[configKey]: checked,
					});
				}}
			/>
		</Field>
	);
}
