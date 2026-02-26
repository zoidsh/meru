import { ipc } from "@meru/renderer-lib/ipc";
import { platform } from "@meru/renderer-lib/utils";
import type { Config } from "@meru/shared/types";
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
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

export function AppearanceSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const renderPlatformIconSettings = () => {
    if (platform.isMacOS) {
      return (
        <>
          <FieldSet>
            <FieldLegend>Dock Icon</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Enable Dock Icon"
                description="Show the application icon in the dock."
                configKey="dock.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label="Show Unread Badge"
                description="Show an unread badge on the dock icon when there are unread emails."
                configKey="dock.unreadBadge"
                restartRequired
              />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Menu Bar Icon</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Enable Menu Bar Icon"
                description="Show the application icon in the menu bar."
                configKey="tray.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label="Show Unread Count"
                description="Show an unread count next to the menu bar icon when there are unread emails."
                configKey="tray.unreadCount"
                disabled={!config["tray.enabled"]}
                restartRequired
              />
            </FieldGroup>
          </FieldSet>
        </>
      );
    }

    return (
      <FieldSet>
        <FieldLegend>System Tray Icon</FieldLegend>
        <ConfigSwitchField
          label="Enable System Tray Icon"
          description="Show the application icon in the system tray."
          configKey="tray.enabled"
          restartRequired
        />
        <Field>
          <FieldContent>
            <FieldLabel>Color</FieldLabel>
            <FieldDescription>Choose the color of the system tray icon.</FieldDescription>
          </FieldContent>
          <Select
            value={config["tray.iconColor"]}
            onValueChange={(color: Config["tray.iconColor"]) => {
              configMutation.mutate(
                {
                  "tray.iconColor": color,
                },
                {
                  onSuccess: () => {
                    restartRequiredToast();
                  },
                },
              );
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select color" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldSet>
    );
  };

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Appearance</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>General</FieldLegend>
            <Field>
              <FieldContent>
                <FieldLabel>Theme</FieldLabel>
                <FieldDescription>Select the application theme.</FieldDescription>
              </FieldContent>
              <Select
                value={config.theme}
                onValueChange={(theme: Config["theme"]) => {
                  ipc.main.send("theme.setTheme", theme);

                  if (!platform.isMacOS) {
                    restartRequiredToast();
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Accounts</FieldLegend>
            <ConfigSwitchField
              label="Show Unread Badges"
              description="Hide all unread badges if disabled regardless of individual account settings."
              configKey="accounts.unreadBadge"
              restartRequired
            />
          </FieldSet>
          <FieldSeparator />
          {renderPlatformIconSettings()}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Window</FieldLegend>
            <ConfigSwitchField
              label="Restrict Minimum Window Size"
              description="Limit the minimum size of the application window to prevent it from being too small."
              configKey="window.restrictMinimumSize"
            />
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
