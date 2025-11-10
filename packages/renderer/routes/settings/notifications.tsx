import { ipc } from "@meru/renderer-lib/ipc";
import { platform } from "@meru/renderer-lib/utils";
import type { Config } from "@meru/shared/types";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from "@meru/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@meru/ui/components/select";
import { Slider } from "@meru/ui/components/slider";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import {
	NOTIFICATION_SOUNDS,
	playNotificationSound,
} from "@/lib/notifications";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function NotificationsSettings() {
	const { config } = useConfig();

	const configMutation = useConfigMutation();

	const isLicenseKeyValid = useIsLicenseKeyValid();

	if (!config) {
		return;
	}

	return (
		<>
			<SettingsHeader>
				<SettingsTitle>Notifications</SettingsTitle>
			</SettingsHeader>
			<FieldGroup>
				<FieldSet>
					<FieldLegend>Emails</FieldLegend>
					<FieldGroup>
						<ConfigSwitchField
							label="New Emails"
							description="Show notifications for new emails."
							configKey="notifications.enabled"
						/>
						{config["notifications.enabled"] && (
							<>
								<ConfigSwitchField
									label="Show Sender"
									description="Display the email sender's name in notifications."
									configKey="notifications.showSender"
								/>
								<ConfigSwitchField
									label="Show Subject"
									description="Display the email subject in notifications."
									configKey="notifications.showSubject"
								/>
								{platform.isMacOS && (
									<ConfigSwitchField
										label="Show Summary"
										description="Display the email summary in notifications."
										configKey="notifications.showSummary"
									/>
								)}
								<Field>
									<FieldLabel>Test Notification</FieldLabel>
									<FieldDescription>
										Show a test notification to see how notifications will
										appear.
									</FieldDescription>
									<div>
										<Button
											variant="outline"
											onClick={() => {
												ipc.main.send("notifications.showTestNotification");
											}}
										>
											Show Test Notification
										</Button>
									</div>
								</Field>
							</>
						)}
					</FieldGroup>
				</FieldSet>
				<FieldSeparator />
				<FieldSet>
					<FieldLegend>Others</FieldLegend>
					<FieldGroup>
						<ConfigSwitchField
							label="Downloads"
							description="Show a notification when a download is completed, cancelled or failed."
							configKey="notifications.downloadCompleted"
						/>
						<ConfigSwitchField
							label="Google Apps"
							description="Allow notifications from Google Apps like Calendar, Meet, Chat, etc."
							configKey="notifications.allowFromGoogleApps"
							licenseKeyRequired
						/>
					</FieldGroup>
				</FieldSet>
				<FieldSeparator />
				<FieldSet>
					<FieldLegend>Sound</FieldLegend>
					<FieldGroup>
						<ConfigSwitchField
							label="Play Sound"
							description="Play a sound when showing a notification."
							configKey="notifications.playSound"
						/>
						{config["notifications.playSound"] && (
							<>
								<Field>
									<FieldLabel className="flex items-center gap-2">
										Sound
										{!isLicenseKeyValid && (
											<Badge variant="secondary">Meru Pro Required</Badge>
										)}
									</FieldLabel>
									<FieldDescription>
										Select the sound to play for notifications.
									</FieldDescription>
									<Select
										value={config["notifications.sound"]}
										onValueChange={(value: Config["notifications.sound"]) => {
											configMutation.mutate({
												"notifications.sound": value,
											});

											if (value !== "system") {
												playNotificationSound(value);
											}
										}}
										disabled={!isLicenseKeyValid}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select sound" />
										</SelectTrigger>
										<SelectContent>
											{Object.entries(NOTIFICATION_SOUNDS).map(
												([sound, { label }]) => (
													<SelectItem key={sound} value={sound}>
														{label}
													</SelectItem>
												),
											)}
											<SelectSeparator />
											<SelectItem value="system">System</SelectItem>
										</SelectContent>
									</Select>
								</Field>
								{config["notifications.sound"] !== "system" && (
									<Field>
										<FieldTitle>
											Volume {(config["notifications.volume"] * 100).toFixed(0)}
											%
										</FieldTitle>
										<FieldDescription>
											Set the volume level for notification sounds.
										</FieldDescription>
										<Slider
											className="my-2"
											step={5}
											value={[config["notifications.volume"] * 100]}
											onValueChange={(value) => {
												const volume = value[0] && value[0] / 100;

												if (volume) {
													configMutation.mutate({
														"notifications.volume": volume,
													});
												}
											}}
											onValueCommit={(value) => {
												const volume = value[0] && value[0] / 100;

												if (
													volume &&
													config["notifications.sound"] !== "system"
												) {
													playNotificationSound(
														config["notifications.sound"],
														volume,
													);
												}
											}}
										/>
									</Field>
								)}
							</>
						)}
					</FieldGroup>
				</FieldSet>
			</FieldGroup>
		</>
	);
}
