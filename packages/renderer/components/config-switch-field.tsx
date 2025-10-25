import type { Config } from "@meru/shared/types";
import { Badge } from "@meru/ui/components/badge";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@meru/ui/components/field";
import { Switch } from "@meru/ui/components/switch";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function ConfigSwitchField({
	configKey,
	label,
	description,
	licenseKeyRequired,
}: {
	configKey: keyof Config;
	label: string;
	description: string;
	licenseKeyRequired?: boolean;
}) {
	const { config } = useConfig();

	const configMutation = useConfigMutation();

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
					{licenseKeyRequired && !isLicenseKeyValid && (
						<Badge variant="secondary">Meru Pro Required</Badge>
					)}
				</FieldLabel>
				<FieldDescription>{description}</FieldDescription>
			</FieldContent>
			<Switch
				id={configKey}
				checked={licenseKeyRequired && !isLicenseKeyValid ? false : checked}
				disabled={licenseKeyRequired && !isLicenseKeyValid}
				onCheckedChange={(checked) => {
					configMutation.mutate({
						[configKey]: checked,
					});
				}}
			/>
		</Field>
	);
}
