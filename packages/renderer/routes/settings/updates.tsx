import { useTranslation } from "@meru/i18n/provider";
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
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

export function UpdatesSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();
  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const notificationDelayItems = [
    { value: "next-day", label: t("settings.updates.delays.nextDay") },
    { value: "few-hours", label: t("settings.updates.delays.fewHours") },
    { value: "immediate", label: t("settings.updates.delays.immediate") },
  ];

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.updates.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <ConfigSwitchField
            label={t("settings.updates.autoCheck")}
            description={t("settings.updates.autoCheckDescription")}
            configKey="updates.autoCheck"
            restartRequired
          />
          <ConfigSwitchField
            label={t("settings.updates.notify")}
            description={t("settings.updates.notifyDescription")}
            configKey="updates.showNotifications"
          />
          <Field>
            <FieldContent>
              <FieldLabel>{t("settings.updates.notificationDelay")}</FieldLabel>
              <FieldDescription>
                {t("settings.updates.notificationDelayDescription")}
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
                <SelectValue placeholder={t("settings.updates.selectNotifyWhen")} />
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
