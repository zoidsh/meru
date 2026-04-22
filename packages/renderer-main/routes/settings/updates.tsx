import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@meru/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

const notificationDelayItems = [
  { value: "next-day", label: "Next day (recommended)" },
  { value: "few-hours", label: "After a few hours" },
  { value: "immediate", label: "Immediately" },
];

export function UpdatesSettings() {
  const { config } = useConfig();
  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Updates</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <ConfigSwitchField
            label="Check For Updates Automatically"
            description="Automatically check for updates periodically."
            configKey="updates.autoCheck"
            restartRequired
          />
          <ConfigSwitchField
            label="Notify When Updates Are Available"
            description="Receive notifications when updates are available."
            configKey="updates.showNotifications"
          />
          <Field>
            <FieldContent>
              <FieldLabel>Notification Delay</FieldLabel>
              <FieldDescription>
                Batch rapid back-to-back releases into a single prompt. Urgent updates always notify
                immediately.
              </FieldDescription>
            </FieldContent>
            <Select
              items={notificationDelayItems}
              value={config["updates.notificationDelay"]}
              onValueChange={(value) => {
                if (value) {
                  configMutation.mutate({
                    "updates.notificationDelay": value,
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select when to notify" />
              </SelectTrigger>
              <SelectContent>
                {notificationDelayItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
