import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { byPlatform } from "@meru/shared/platform";
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
import { useId } from "react";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { restartRequiredToast } from "@/lib/toast";
import { platform } from "@/lib/utils";

// lingui-set comment="Option of the Theme setting"
const themeItems = [
  { value: "light", label: msg`Light` },
  { value: "dark", label: msg`Dark` },
  { value: "system", label: msg`System` },
];
// lingui-reset

// lingui-set comment="Option of the system tray icon's Color setting"
const systemTrayIconColorItems = [
  {
    value: "light",
    label: msg({
      message: "Light",
      context: "tray icon color",
      comment:
        "Option of the system tray icon's Color setting; agrees with the word for color where the language genders it",
    }),
  },
  {
    value: "dark",
    label: msg({
      message: "Dark",
      context: "tray icon color",
      comment:
        "Option of the system tray icon's Color setting; agrees with the word for color where the language genders it",
    }),
  },
  { value: "system", label: msg`System` },
];
// lingui-reset

// lingui-set comment="Option of the Window controls setting: whether the titlebar shows the close, minimize and maximize buttons"
const linuxWindowControlsItems = [
  { value: "auto", label: msg`Automatic` },
  { value: "show", label: msg`Show` },
  { value: "hide", label: msg`Hide` },
];
// lingui-reset

export function AppearanceSettings() {
  const { config } = useConfig();

  const themeFieldId = useId();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  const translatedThemeItems = themeItems.map(({ value, label }) => ({ value, label: t(label) }));

  const renderPlatformIconSettings = () => {
    const selectAccountWithUnreadField = (
      <ConfigSwitchField
        label={t`Select first unread account on click`}
        description={byPlatform(platform, {
          macOS: t`Automatically select the first account with unread emails when clicking the menu bar icon.`,
          windows: t({
            message:
              "Automatically select the first account with unread emails when clicking the system tray icon.",
            context: "Windows",
          }),
          linux: t({
            message:
              "Automatically select the first account with unread emails when clicking the system tray icon.",
            context: "Linux",
          }),
        })}
        configKey="tray.selectAccountWithUnread"
        disabled={!config["tray.enabled"]}
      />
    );

    if (platform.isMacOS) {
      return (
        <>
          <FieldSet>
            <FieldLegend>
              <Trans>Dock icon</Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t`Enable dock icon`}
                description={t`Show the application icon in the dock.`}
                configKey="dock.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label={t`Show unread badge`}
                description={t`Show an unread badge on the dock icon when there are unread emails.`}
                configKey="dock.unreadBadge"
                restartRequired
              />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans>Menu bar icon</Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t`Enable menu bar icon`}
                description={t`Show the application icon in the menu bar.`}
                configKey="tray.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label={t`Show unread count`}
                description={t`Show an unread count next to the menu bar icon when there are unread emails.`}
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

    // Only Windows and Linux get here, and each names the tray its own way.
    return (
      <FieldSet>
        <FieldLegend>
          {platform.isWindows
            ? t({ message: "System tray icon", context: "Windows" })
            : t({ message: "System tray icon", context: "Linux" })}
        </FieldLegend>
        <ConfigSwitchField
          label={
            platform.isWindows
              ? t({ message: "Enable system tray icon", context: "Windows" })
              : t({ message: "Enable system tray icon", context: "Linux" })
          }
          description={
            platform.isWindows
              ? t({ message: "Show the application icon in the system tray.", context: "Windows" })
              : t({ message: "Show the application icon in the system tray.", context: "Linux" })
          }
          configKey="tray.enabled"
          restartRequired
        />
        <ConfigSelectField
          configKey="tray.iconColor"
          label={t({
            message: "Color",
            comment: "Setting that picks the system tray icon's color",
          })}
          description={
            platform.isWindows
              ? t({ message: "Choose the color of the system tray icon.", context: "Windows" })
              : t({ message: "Choose the color of the system tray icon.", context: "Linux" })
          }
          items={systemTrayIconColorItems.map(({ value, label }) => ({ value, label: t(label) }))}
          restartRequired
        />
        {selectAccountWithUnreadField}
      </FieldSet>
    );
  };

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.appearance)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Appearance section for the settings that apply to the whole app">
                General
              </Trans>
            </FieldLegend>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor={themeFieldId}>
                  <Trans comment="Setting that picks a light or dark appearance">Theme</Trans>
                </FieldLabel>
                <FieldDescription>
                  <Trans>Select the application theme.</Trans>
                </FieldDescription>
              </FieldContent>
              <Select
                items={translatedThemeItems}
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
                <SelectTrigger id={themeFieldId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {translatedThemeItems.map(({ value, label }) => (
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
            <FieldLegend>
              <Trans comment="Heading of the Appearance section for how accounts look">
                Accounts
              </Trans>
            </FieldLegend>
            <ConfigSwitchField
              label={t`Show unread badges`}
              description={t`Show unread badges, following each account's own setting.`}
              configKey="accounts.unreadBadge"
              restartRequired
            />
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Appearance section for the bar along the top of Meru's window">
                Titlebar
              </Trans>
            </FieldLegend>
            <ConfigSwitchField
              label={t`Show Do Not Disturb button`}
              description={t`Show the button that turns Do Not Disturb on and off. Turning this off also turns Do Not Disturb off.`}
              configKey="doNotDisturb.showTitlebarButton"
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          {renderPlatformIconSettings()}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Appearance section about Meru's window">Window</Trans>
            </FieldLegend>
            {platform.isLinux && (
              <ConfigSelectField
                configKey="window.linuxWindowControls"
                label={t`Window controls`}
                description={t({
                  message:
                    "Show the close, minimize and maximize buttons in the titlebar. Automatic hides them on window managers without decorations, such as dwm, i3 and sway.",
                  comment:
                    "Automatic is this setting's first option; dwm, i3 and sway are window managers",
                })}
                items={linuxWindowControlsItems.map(({ value, label }) => ({
                  value,
                  label: t(label),
                }))}
                restartRequired
              />
            )}
            <ConfigSwitchField
              label={t`Restrict minimum window size`}
              description={t`Stop the application window from being resized below a usable minimum.`}
              configKey="window.restrictMinimumSize"
            />
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
