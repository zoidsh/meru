import { ipc } from "@meru/shared/renderer/ipc";
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
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { platform } from "@/lib/utils";

const themeItems = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const systemTrayIconColorItems = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function AppearanceSettings() {
  const { config } = useConfig();

  if (!config) {
    return;
  }

  const renderPlatformIconSettings = () => {
    const selectAccountWithUnreadField = (
      <ConfigSwitchField
        label="Select first unread account on click"
        description={`Automatically select the first account with unread emails when clicking the ${platform.isMacOS ? "menu bar" : "system tray"} icon.`}
        configKey="tray.selectAccountWithUnread"
        disabled={!config["tray.enabled"]}
      />
    );

    if (platform.isMacOS) {
      return (
        <>
          <FieldSet>
            <FieldLegend>Dock icon</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Enable dock icon"
                description="Show the application icon in the dock."
                configKey="dock.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label="Show unread badge"
                description="Show an unread badge on the dock icon when there are unread emails."
                configKey="dock.unreadBadge"
                restartRequired
              />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Menu bar icon</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Enable menu bar icon"
                description="Show the application icon in the menu bar."
                configKey="tray.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label="Show unread count"
                description="Show an unread count next to the menu bar icon when there are unread emails."
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
        <FieldLegend>System tray icon</FieldLegend>
        <ConfigSwitchField
          label="Enable system tray icon"
          description="Show the application icon in the system tray."
          configKey="tray.enabled"
          restartRequired
        />
        <ConfigSelectField
          configKey="tray.iconColor"
          label="Color"
          description="Choose the color of the system tray icon."
          items={systemTrayIconColorItems}
          placeholder="Select color"
          restartRequired
        />
        {selectAccountWithUnreadField}
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
                  <SelectValue placeholder="Select theme" />
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
            <FieldLegend>Accounts</FieldLegend>
            <ConfigSwitchField
              label="Show unread badges"
              description="Show unread badges, following each account's own setting."
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
              label="Restrict minimum window size"
              description="Stop the application window from being resized below a usable minimum."
              configKey="window.restrictMinimumSize"
            />
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
