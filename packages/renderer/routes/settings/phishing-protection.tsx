import { Button } from "@meru/ui/components/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import {
	Settings,
	SettingsContent,
	SettingsHeader,
	SettingsTitle,
} from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function PhishingProtectionSettings() {
	const { config } = useConfig();

	const configMutation = useConfigMutation();

	const isLicenseKeyValid = useIsLicenseKeyValid();

	if (!config) {
		return;
	}

	return (
		<Settings>
			<SettingsHeader>
				<SettingsTitle>Phishing Protection</SettingsTitle>
			</SettingsHeader>
			<SettingsContent>
				<LicenseKeyRequiredBanner />
				<FieldGroup>
					<ConfigSwitchField
						label="Confirm External Links Before Opening"
						description="Prompt for confirmation before opening links from untrusted hosts in your browser."
						configKey="externalLinks.confirm"
						licenseKeyRequired
					/>
					{isLicenseKeyValid && config["externalLinks.confirm"] && (
						<>
							<FieldSeparator />
							<Field>
								<FieldContent>
									<FieldLabel>Trusted Hosts</FieldLabel>
									{config["externalLinks.trustedHosts"].length === 0 && (
										<FieldDescription>No trusted hosts added.</FieldDescription>
									)}
								</FieldContent>
								{config["externalLinks.trustedHosts"].length > 0 && (
									<div className="space-y-4">
										{config["externalLinks.trustedHosts"].map((host) => (
											<div
												className="flex text-sm items-center pb-4 not-last:border-b"
												key={host}
											>
												<div className="flex-1">{host}</div>
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														configMutation.mutate({
															"externalLinks.trustedHosts": config[
																"externalLinks.trustedHosts"
															].filter((trustedHost) => trustedHost !== host),
														});
													}}
												>
													Remove
												</Button>
											</div>
										))}
									</div>
								)}
							</Field>
						</>
					)}
				</FieldGroup>
			</SettingsContent>
		</Settings>
	);
}
