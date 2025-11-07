import { FieldGroup } from "@meru/ui/components/field";
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
				<FieldGroup>
					<ConfigSwitchField
						label="Open in App"
						description="Open Google Apps in app instead of external browser."
						configKey="googleApps.openInApp"
						licenseKeyRequired
					/>
					<ConfigSwitchField
						label="Open Google Apps in New Window"
						description="Open Google Apps in a new window instead of reusing the same window if it is already open."
						configKey="googleApps.openAppsInNewWindow"
						licenseKeyRequired
					/>
				</FieldGroup>
			</SettingsContent>
		</Settings>
	);
}
