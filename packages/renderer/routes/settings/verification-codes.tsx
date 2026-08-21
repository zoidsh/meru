import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";

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
        <SettingsTitle>Verification codes</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Copy codes to clipboard"
            description="Copy a verification code to your clipboard as soon as it arrives by email."
            configKey="verificationCodes.autoCopy"
            licenseKeyRequired
          />
          <ConfigSelectField
            configKey="verificationCodes.confidence"
            label="Detection confidence"
            description="Choose how certain Meru has to be before it treats something as a verification code. Medium can pick up codes that aren't there. High looks for explicit keywords and can miss some."
            items={verificationCodeConfidenceItems}
            placeholder="Select confidence"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Mark email as read after copying"
            description="Mark the email as read once its verification code has been copied."
            configKey="verificationCodes.autoMarkAsRead"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Delete email after copying"
            description="Delete the email once its verification code has been copied."
            configKey="verificationCodes.autoDelete"
            licenseKeyRequired
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
