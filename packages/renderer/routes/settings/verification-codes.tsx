import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import type { Config } from "@meru/shared/types";

export function VerificationCodesSettings() {
  const { config } = useConfig();
  const configMutation = useConfigMutation();

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
          <Field>
            <FieldContent>
              <FieldLabel>Verification Code Detection Confidence</FieldLabel>
              <FieldDescription>
                Choose the confidence level for detecting verification codes. Medium may result in
                false positives, while High checks for explicit keywords, but may miss some codes.
              </FieldDescription>
            </FieldContent>
            <Select
              value={config["verificationCodes.confidence"]}
              onValueChange={(value: Config["verificationCodes.confidence"]) => {
                configMutation.mutate({
                  "verificationCodes.confidence": value,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
              </SelectContent>
            </Select>
          </Field>
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
