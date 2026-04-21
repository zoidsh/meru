import { useTranslation } from "@meru/i18n/provider";
import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";

export function UnifiedInboxSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.unifiedInbox.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t("settings.unifiedInbox.enabled")}
            description={t("settings.unifiedInbox.enabledDescription")}
            configKey="unifiedInbox.enabled"
            licenseKeyRequired
            restartRequired
          />
          {config["unifiedInbox.enabled"] && (
            <ConfigSwitchField
              label={t("settings.unifiedInbox.showSenderIcons")}
              description={t("settings.unifiedInbox.showSenderIconsDescription")}
              configKey="unifiedInbox.showSenderIcons"
              licenseKeyRequired
            />
          )}
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
