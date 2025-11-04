import { ConfigSwitchField } from "@/components/config-switch-field";
import {
	Settings,
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";

export function GoogleAppsSettings() {
	return (
		<Settings>
			<SettingsHeader>
				<SettingsTitle>Google Apps</SettingsTitle>
			</SettingsHeader>
			<SettingsContent>
				<ConfigSwitchField
					label="Open in App"
					description="Open Google Apps in app within the account context."
					configKey="googleApps.openInApp"
					licenseKeyRequired
				/>
			</SettingsContent>
		</Settings>
	);
}
