import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Alert, AlertDescription, AlertTitle } from "@meru/ui/components/alert";
import { FieldGroup } from "@meru/ui/components/field";
import { CircleAlertIcon } from "lucide-react";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsBelowMinimumMacOSVersion } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

// lingui-set comment="Option of the Release channel setting: which releases Meru updates to"
const releaseChannelItems = [
  { value: "stable", label: msg`Stable` },
  { value: "beta", label: msg`Beta` },
];
// lingui-reset

function BelowMinimumMacOSVersionAlert() {
  return (
    <Alert>
      <CircleAlertIcon />
      <AlertTitle>
        <Trans>This is the last version of Meru for this Mac</Trans>
      </AlertTitle>
      <AlertDescription>
        <Trans>
          Updates need macOS 13 or later, so Meru won't check for them on this Mac. This version
          keeps working, but it gets no further fixes, security fixes included, so using it long
          term is at your own risk.
        </Trans>
      </AlertDescription>
    </Alert>
  );
}

export function UpdatesSettings() {
  const isBelowMinimumMacOSVersion = useIsBelowMinimumMacOSVersion();

  const { t } = useLingui();

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.updates)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          {isBelowMinimumMacOSVersion && <BelowMinimumMacOSVersionAlert />}
          <ConfigSwitchField
            label={t`Check for updates automatically`}
            description={t`Check for updates in the background.`}
            configKey="updates.autoCheck"
            disabled={isBelowMinimumMacOSVersion}
            restartRequired
          />
          <ConfigSwitchField
            label={t`Notify when updates are available`}
            description={t`Receive notifications when updates are available.`}
            configKey="updates.showNotifications"
            disabled={isBelowMinimumMacOSVersion}
          />
          <ConfigSelectField
            label={t`Release channel`}
            description={t`Choose which releases to receive. The beta channel gets upcoming features early.`}
            configKey="updates.channel"
            items={releaseChannelItems.map(({ value, label }) => ({ value, label: t(label) }))}
            disabled={isBelowMinimumMacOSVersion}
            confirmation={{
              when: (value) => value === "beta",
              title: t`Switch to the beta channel?`,
              description: t`Beta releases are unfinished builds of upcoming versions. They can contain bugs and break in ways a stable release won't. You can switch back to the stable channel at any time.`,
              confirmLabel: t({
                message: "Switch to beta",
                comment: "Button that confirms moving to the beta release channel",
              }),
            }}
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
