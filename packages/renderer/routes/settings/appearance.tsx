import { useTranslation } from "@meru/i18n/provider";
import { ipc } from "@meru/renderer-lib/ipc";
import { platform } from "@meru/renderer-lib/utils";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@meru/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

export function AppearanceSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const themeItems = [
    { value: "light", label: t("settings.appearance.themes.light") },
    { value: "dark", label: t("settings.appearance.themes.dark") },
    { value: "system", label: t("settings.appearance.themes.system") },
  ];

  const systemTrayIconColorItems = [
    { value: "light", label: t("settings.appearance.trayColors.light") },
    { value: "dark", label: t("settings.appearance.trayColors.dark") },
    { value: "system", label: t("settings.appearance.trayColors.system") },
  ];

  const renderPlatformIconSettings = () => {
    const selectAccountWithUnreadField = (
      <ConfigSwitchField
        label={t("settings.appearance.selectAccountWithUnread")}
        description={
          platform.isMacOS
            ? t("settings.appearance.selectAccountWithUnreadDescriptionMenuBar")
            : t("settings.appearance.selectAccountWithUnreadDescriptionTray")
        }
        configKey="tray.selectAccountWithUnread"
        disabled={!config["tray.enabled"]}
      />
    );

    if (platform.isMacOS) {
      return (
        <>
          <FieldSet>
            <FieldLegend>{t("settings.appearance.dockIcon")}</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t("settings.appearance.enableDockIcon")}
                description={t("settings.appearance.enableDockIconDescription")}
                configKey="dock.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label={t("settings.appearance.showUnreadBadge")}
                description={t("settings.appearance.showUnreadBadgeDescription")}
                configKey="dock.unreadBadge"
                restartRequired
              />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.appearance.menuBarIcon")}</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t("settings.appearance.enableMenuBarIcon")}
                description={t("settings.appearance.enableMenuBarIconDescription")}
                configKey="tray.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label={t("settings.appearance.showUnreadCount")}
                description={t("settings.appearance.showUnreadCountDescription")}
                configKey="tray.unreadCount"
                disabled={!config["tray.enabled"]}
                restartRequired
              />
              {selectAccountWithUnreadField}
            </FieldGroup>
          </FieldSet>
        </>
      );
    }

    return (
      <FieldSet>
        <FieldLegend>{t("settings.appearance.systemTrayIcon")}</FieldLegend>
        <ConfigSwitchField
          label={t("settings.appearance.enableSystemTrayIcon")}
          description={t("settings.appearance.enableSystemTrayIconDescription")}
          configKey="tray.enabled"
          restartRequired
        />
        <Field>
          <FieldContent>
            <FieldLabel>{t("settings.appearance.color")}</FieldLabel>
            <FieldDescription>{t("settings.appearance.colorDescription")}</FieldDescription>
          </FieldContent>
          <Select
            items={systemTrayIconColorItems}
            value={config["tray.iconColor"]}
            onValueChange={(value) => {
              if (value) {
                configMutation.mutate(
                  {
                    "tray.iconColor": value,
                  },
                  {
                    onSuccess: () => {
                      restartRequiredToast();
                    },
                  },
                );
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("settings.appearance.selectColor")} />
            </SelectTrigger>
            <SelectContent>
              {systemTrayIconColorItems.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {selectAccountWithUnreadField}
      </FieldSet>
    );
  };

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.appearance.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t("settings.appearance.general")}</FieldLegend>
            <Field>
              <FieldContent>
                <FieldLabel>{t("settings.appearance.theme")}</FieldLabel>
                <FieldDescription>{t("settings.appearance.themeDescription")}</FieldDescription>
              </FieldContent>
              <Select
                items={themeItems}
                value={config.theme}
                onValueChange={(value) => {
                  if (value) {
                    ipc.main.send("theme.setTheme", value);

                    if (!platform.isMacOS) {
                      restartRequiredToast();
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("settings.appearance.selectTheme")} />
                </SelectTrigger>
                <SelectContent>
                  {themeItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.appearance.accounts")}</FieldLegend>
            <ConfigSwitchField
              label={t("settings.appearance.showUnreadBadges")}
              description={t("settings.appearance.showUnreadBadgesDescription")}
              configKey="accounts.unreadBadge"
              restartRequired
            />
          </FieldSet>
          <FieldSeparator />
          {renderPlatformIconSettings()}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.appearance.window")}</FieldLegend>
            <ConfigSwitchField
              label={t("settings.appearance.restrictMinimumSize")}
              description={t("settings.appearance.restrictMinimumSizeDescription")}
              configKey="window.restrictMinimumSize"
            />
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
