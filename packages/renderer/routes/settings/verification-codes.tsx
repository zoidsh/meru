import { useTranslation } from "@meru/i18n/provider";
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
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { Badge } from "@meru/ui/components/badge";

export function VerificationCodesSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();
  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config) {
    return;
  }

  const verificationCodeConfidenceItems = [
    { value: "high", label: t("settings.verificationCodes.confidenceHigh") },
    { value: "medium", label: t("settings.verificationCodes.confidenceMedium") },
  ];

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.verificationCodes.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t("settings.verificationCodes.autoCopy")}
            description={t("settings.verificationCodes.autoCopyDescription")}
            configKey="verificationCodes.autoCopy"
            licenseKeyRequired
          />
          <Field>
            <FieldContent>
              <FieldLabel className="flex items-center gap-2">
                {t("settings.verificationCodes.detectionConfidence")}
                {!isLicenseKeyValid && (
                  <Badge variant="secondary">{t("settings.common.meruProRequired")}</Badge>
                )}
              </FieldLabel>
              <FieldDescription>
                {t("settings.verificationCodes.detectionConfidenceDescription")}
              </FieldDescription>
            </FieldContent>
            <Select
              items={verificationCodeConfidenceItems}
              value={config["verificationCodes.confidence"]}
              onValueChange={(value) => {
                if (value) {
                  configMutation.mutate({
                    "verificationCodes.confidence": value,
                  });
                }
              }}
              disabled={!isLicenseKeyValid}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("settings.verificationCodes.selectConfidence")} />
              </SelectTrigger>
              <SelectContent>
                {verificationCodeConfidenceItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ConfigSwitchField
            label={t("settings.verificationCodes.autoMarkAsRead")}
            description={t("settings.verificationCodes.autoMarkAsReadDescription")}
            configKey="verificationCodes.autoMarkAsRead"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label={t("settings.verificationCodes.autoDelete")}
            description={t("settings.verificationCodes.autoDeleteDescription")}
            configKey="verificationCodes.autoDelete"
            licenseKeyRequired
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
