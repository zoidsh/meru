import { ipc } from "@meru/renderer-lib/ipc";
import type { Config } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
} from "@meru/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@meru/ui/components/select";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import {
	Settings,
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

export function GmailSettings() {
	const isLicenseKeyValid = useIsLicenseKeyValid();

	const { config } = useConfig();

	const configMutation = useConfigMutation();

	if (!config) {
		return;
	}

	return (
		<Settings>
			<SettingsHeader>
				<SettingsTitle>Gmail</SettingsTitle>
			</SettingsHeader>
			<SettingsContent>
				<LicenseKeyRequiredBanner />
				<FieldGroup>
					<FieldSet>
						<FieldLegend>General</FieldLegend>
						<ConfigSwitchField
							label="Always Compose New Emails in New Window"
							description="Opens a new window for composing emails instead of inside Gmail."
							configKey="gmail.openComposeInNewWindow"
							restartRequired
						/>
					</FieldSet>
					<FieldSet>
						<FieldLegend>Appearance</FieldLegend>
						<ConfigSwitchField
							label="Hide Gmail Logo"
							description="Hides the Gmail logo on the top left corner."
							configKey="gmail.hideGmailLogo"
							restartRequired
						/>
						<ConfigSwitchField
							label="Hide Inbox Footer"
							description="Hides the footer at the bottom of the inbox."
							configKey="gmail.hideInboxFooter"
							restartRequired
						/>
						<ConfigSwitchField
							label="Reverse Conversation"
							description="Displays email conversations in reverse order, showing the latest message at the top."
							configKey="gmail.reverseConversation"
							restartRequired
							licenseKeyRequired
						/>
						<Field>
							<FieldContent>
								<FieldLabel className="flex items-center gap-2">
									User Styles
									<LicenseKeyRequiredFieldBadge />
								</FieldLabel>
								<FieldDescription>
									Add your own custom CSS to further personalize the Gmail
									interface. A restart is required after making changes.
								</FieldDescription>
							</FieldContent>
							<div>
								<Button
									variant="outline"
									onClick={() => {
										ipc.main.send("gmail.openUserStylesInEditor");
									}}
									disabled={!isLicenseKeyValid}
								>
									Open in Editor
								</Button>
							</div>
						</Field>
					</FieldSet>
					<FieldSeparator />
					<FieldSet>
						<FieldLegend>Inbox</FieldLegend>
						<Field>
							<FieldContent>
								<FieldLabel className="flex items-center gap-2">
									Unread Count Preference <LicenseKeyRequiredFieldBadge />
								</FieldLabel>
								<FieldDescription>
									When using multiple inboxes, sets which sections contribute to
									the unread count shown on the app. Default combines all
									sections.
								</FieldDescription>
							</FieldContent>
							<Select
								value={config["gmail.unreadCountPreference"]}
								onValueChange={(
									value: Config["gmail.unreadCountPreference"],
								) => {
									configMutation.mutate(
										{
											"gmail.unreadCountPreference": value,
										},
										{
											onSuccess: restartRequiredToast,
										},
									);
								}}
								disabled={!isLicenseKeyValid}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select unread count preference" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="default">Default</SelectItem>
									<SelectItem value="first-section">
										First Section Only
									</SelectItem>
									<SelectItem value="inbox">Inbox Only</SelectItem>
								</SelectContent>
							</Select>
						</Field>
					</FieldSet>
				</FieldGroup>
			</SettingsContent>
		</Settings>
	);
}
