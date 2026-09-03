import { verificationCodeCopyModes } from "@meru/shared/verification-codes";
import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { platform } from "@/lib/utils";

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
            description="Detect a verification code in an incoming email and copy it to your clipboard."
            configKey="verificationCodes.autoCopy"
            licenseKeyRequired
          />
          <ConfigSelectField
            label="When to copy"
            description={`A notification shows the code either way. Copying ${platform.isLinux ? "on click" : "from its Copy button"} leaves your clipboard untouched until you act.`}
            configKey="verificationCodes.copyMode"
            items={Object.entries(verificationCodeCopyModes).map(([value, label]) => ({
              value,
              label,
            }))}
            disabled={!config["verificationCodes.autoCopy"]}
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Mark email as read after copying"
            description="Mark the email as read once its verification code has been copied."
            configKey="verificationCodes.autoMarkAsRead"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Move email to Trash after copying"
            description="Move the email to Trash once its verification code has been copied. Detection can misfire, and a real email can be moved too — Mark email as read is the safer choice."
            configKey="verificationCodes.autoDelete"
            licenseKeyRequired
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
