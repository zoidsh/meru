import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

const releaseChannelItems = [
  { value: "stable", label: "Stable" },
  { value: "beta", label: "Beta" },
];

export function UpdatesSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Updates</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <ConfigSwitchField
            label="Check for updates automatically"
            description="Check for updates in the background."
            configKey="updates.autoCheck"
            restartRequired
          />
          <ConfigSwitchField
            label="Notify when updates are available"
            description="Receive notifications when updates are available."
            configKey="updates.showNotifications"
          />
          <ConfigSelectField
            label="Release channel"
            description="Choose which releases to receive. The beta channel gets upcoming features early."
            configKey="updates.channel"
            items={releaseChannelItems}
            placeholder="Select channel"
            confirmation={{
              when: (value) => value === "beta",
              title: "Switch to the beta channel?",
              description:
                "Beta releases are pre-release builds of upcoming versions. They might contain bugs or unfinished features. You can switch back to the stable channel at any time.",
              confirmLabel: "Switch to beta",
            }}
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
