import { useTranslation } from "@meru/i18n/provider";
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
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";

export function PhishingProtectionSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.phishingProtection.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t("settings.phishingProtection.confirmExternalLinks")}
            description={t("settings.phishingProtection.confirmExternalLinksDescription")}
            configKey="externalLinks.confirm"
            licenseKeyRequired
          />
          {isLicenseKeyValid && config["externalLinks.confirm"] && (
            <>
              <FieldSeparator />
              <Field>
                <FieldContent>
                  <FieldLabel>{t("settings.phishingProtection.trustedHosts")}</FieldLabel>
                  {config["externalLinks.trustedHosts"].length === 0 && (
                    <FieldDescription>
                      {t("settings.phishingProtection.noTrustedHosts")}
                    </FieldDescription>
                  )}
                </FieldContent>
                {config["externalLinks.trustedHosts"].length > 0 && (
                  <div className="space-y-4">
                    {config["externalLinks.trustedHosts"].map((host) => (
                      <div className="flex text-sm items-center pb-4 not-last:border-b" key={host}>
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
                          {t("settings.phishingProtection.remove")}
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
