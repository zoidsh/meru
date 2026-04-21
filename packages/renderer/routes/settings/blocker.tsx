import { useTranslation } from "@meru/i18n/provider";
import { FieldGroup, FieldSeparator } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";

export function BlockerSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.blocker.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t("settings.blocker.enable")}
            description={t("settings.blocker.enableDescription")}
            configKey="blocker.enabled"
            licenseKeyRequired
            restartRequired
          />
          <FieldSeparator />
          <ConfigSwitchField
            label={t("settings.blocker.blockAds")}
            description={t("settings.blocker.blockAdsDescription")}
            configKey="blocker.ads"
            disabled={!config["blocker.enabled"]}
            licenseKeyRequired
            restartRequired
          />
          <ConfigSwitchField
            label={t("settings.blocker.blockTrackers")}
            description={t("settings.blocker.blockTrackersDescription")}
            configKey="blocker.tracking"
            disabled={!config["blocker.enabled"]}
            licenseKeyRequired
            restartRequired
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
