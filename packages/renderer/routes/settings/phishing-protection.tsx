import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldSeparator,
  FieldTitle,
} from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

export function PhishingProtectionSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.phishingProtection)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t`Confirm external links before opening`}
            description={t`Prompt for confirmation before opening links from untrusted hosts in your browser.`}
            configKey="externalLinks.confirm"
            licenseKeyRequired
          />
          {isLicenseKeyValid && config["externalLinks.confirm"] && (
            <>
              <FieldSeparator />
              <Field>
                <FieldContent>
                  <FieldTitle>
                    <Trans>Trusted hosts</Trans>
                  </FieldTitle>
                  {config["externalLinks.trustedHosts"].length === 0 && (
                    <FieldDescription>
                      <Trans comment="Trust all links on quotes the checkbox in the dialog that asks before opening an external link, Trust all links on {origin}, so it matches that checkbox's wording">
                        No trusted hosts yet. Selecting Trust all links on a host in the link prompt
                        adds it here.
                      </Trans>
                    </FieldDescription>
                  )}
                </FieldContent>
                {config["externalLinks.trustedHosts"].length > 0 && (
                  <div className="space-y-4">
                    {config["externalLinks.trustedHosts"].map((host) => (
                      <div className="flex items-center pb-4 text-sm not-last:border-b" key={host}>
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
                          <Trans comment="Button that removes a host from the trusted hosts">
                            Remove
                          </Trans>
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
