import { useLingui } from "@lingui/react/macro";
import { FieldGroup, FieldSeparator } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

export function BlockerSettings() {
  const { config } = useConfig();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.blocker)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t`Enable blocker`}
            description={t`Block unwanted content and network requests.`}
            configKey="blocker.enabled"
            licenseKeyRequired
            restartRequired
          />
          <FieldSeparator />
          <ConfigSwitchField
            label={t`Block ads`}
            description={t`Block advertisements on the pages you open.`}
            configKey="blocker.ads"
            disabled={!config["blocker.enabled"]}
            licenseKeyRequired
            restartRequired
          />
          <ConfigSwitchField
            label={t`Block trackers`}
            description={t`Block the scripts that follow you from site to site.`}
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
