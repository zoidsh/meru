import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";

const verificationCodeConfidenceItems = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
];

export function VerificationCodesSettings() {
  const { config } = useConfig();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Verification Codes</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Automatically Copy Verification Code to Clipboard"
            description="Verification code received via email will be automatically copied
							to your clipboard for easy and instant pasting."
            configKey="verificationCodes.autoCopy"
            licenseKeyRequired
          />
          <ConfigSelectField
            configKey="verificationCodes.confidence"
            label="Verification Code Detection Confidence"
            description="Choose the confidence level for detecting verification codes. Medium may result in false positives, while High checks for explicit keywords, but may miss some codes."
            items={verificationCodeConfidenceItems}
            placeholder="Select confidence"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Automatically Mark Email as Read After Copying Verification Code"
            description="Email containing verification code will be automatically marked as read
							after the code has been copied to your clipboard."
            configKey="verificationCodes.autoMarkAsRead"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Automatically Delete Email After Copying Verification Code"
            description="Email containing verification code will be automatically deleted
							after the code has been copied to your clipboard."
            configKey="verificationCodes.autoDelete"
            licenseKeyRequired
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
