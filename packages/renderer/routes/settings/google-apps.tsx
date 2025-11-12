import { googleAppsPinnedApps } from "@meru/shared/types";
import { Checkbox } from "@meru/ui/components/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "@meru/ui/components/field";
import { Label } from "@meru/ui/components/label";
import type { Entries } from "type-fest";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import {
	Settings,
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function GoogleAppsSettings() {
	const { config } = useConfig();

	const configMutation = useConfigMutation();

	const isLicenseKeyValid = useIsLicenseKeyValid();

	if (!config) {
		return;
	}

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
					<FieldSeparator />
					<Field>
						<FieldContent>
							<FieldLabel className="flex items-center gap-2">
								Pinned Apps
								{!isLicenseKeyValid && <LicenseKeyRequiredFieldBadge />}
							</FieldLabel>
							<FieldDescription>
								Select which Google Apps are pinned in the titlebar for easy
								access.
							</FieldDescription>
						</FieldContent>
						<div className="grid grid-cols-2 gap-3">
							{(
								Object.entries(googleAppsPinnedApps) as Entries<
									typeof googleAppsPinnedApps
								>
							).map(([app, label]) => (
								<div className="flex items-center gap-2" key={app}>
									<Checkbox
										id={app}
										checked={
											isLicenseKeyValid &&
											config["googleApps.pinnedApps"].includes(app)
										}
										onCheckedChange={(checked) => {
											configMutation.mutate({
												"googleApps.pinnedApps": checked
													? [...config["googleApps.pinnedApps"], app]
													: config["googleApps.pinnedApps"].filter(
															(value) => value !== app,
														),
											});
										}}
										disabled={!isLicenseKeyValid}
									/>
									<Label htmlFor={app}>{label}</Label>
								</div>
							))}
						</div>
					</Field>
				</FieldGroup>
			</SettingsContent>
		</Settings>
	);
}
