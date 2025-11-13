import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import {
	Settings,
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";

export function VerificationCodesSettings() {
	return (
		<Settings>
			<SettingsHeader>
				<SettingsTitle>Verification Codes</SettingsTitle>
			</SettingsHeader>
			<SettingsContent>
				<LicenseKeyRequiredBanner />
				<FieldGroup>
					<ConfigSwitchField
						label="Automatically copy verification codes to clipboard"
						description="Verification codes received via email will be automatically copied
							to your clipboard for easy pasting."
						configKey="verificationCodes.autoCopy"
						licenseKeyRequired
					/>
					<ConfigSwitchField
						label="Automatically delete emails after copying"
						description="Emails containing verification codes will be automatically deleted
							after the code has been copied to your clipboard."
						configKey="verificationCodes.autoDelete"
						licenseKeyRequired
					/>
				</FieldGroup>
			</SettingsContent>
		</Settings>
	);
}
