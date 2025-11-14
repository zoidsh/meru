import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
} from "@meru/ui/components/field";
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

export function GmailSettings() {
	const isLicenseKeyValid = useIsLicenseKeyValid();

	return (
		<Settings>
			<SettingsHeader>
				<SettingsTitle>Gmail</SettingsTitle>
			</SettingsHeader>
			<SettingsContent>
				<LicenseKeyRequiredBanner />
				<FieldGroup>
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
				</FieldGroup>
			</SettingsContent>
		</Settings>
	);
}
