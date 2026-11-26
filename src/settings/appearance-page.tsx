import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import type { SettingChange } from "#contract/settings.ts";
import { PROFILE_TINT_STRENGTHS } from "#core/profile-color.ts";
import type { ProfileTintStrength } from "#core/profile-color.ts";
import { THEMES } from "#core/settings.ts";
import type { ThemeChoice } from "#core/settings.ts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { useNeedsPro } from "./pro-badge.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

type SwitchKey =
  | "profileTint"
  | "titlebarNewTab"
  | "titlebarUnifiedInbox"
  | "titlebarDownloads"
  | "titlebarDoNotDisturb";

/**
 * How Meru looks: its theme, the profile tint and which titlebar buttons
 * show. App settings alone, so the page has no scopes.
 */
export const AppearancePage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");
  const needsPro = useNeedsPro();

  if (!settings) {
    return null;
  }

  const calls = settingsCalls();
  const write = (change: SettingChange) => {
    calls.update(change).catch(noop);
  };

  const switchRow = ({
    key,
    label,
    description,
  }: {
    key: SwitchKey;
    label: string;
    description?: string | undefined;
  }) => (
    <SettingRow
      key={key}
      label={label}
      description={description}
      pro={needsPro.setting(key)}
      disabled={needsPro.setting(key)}
    >
      {(ids) => (
        <Switch
          checked={settings[key]}
          disabled={needsPro.setting(key)}
          aria-labelledby={ids.label}
          aria-describedby={ids.description || undefined}
          onCheckedChange={(on) => {
            write({ key, value: on });
          }}
        />
      )}
    </SettingRow>
  );

  const themes: Record<ThemeChoice, string> = {
    system: t({
      message: "System",
      comment:
        "Choice of the Theme menu in Settings: Meru is light or dark as the system is",
    }),
    light: t({
      message: "Light",
      comment: "Choice of the Theme menu in Settings: Meru is always light",
    }),
    dark: t({
      message: "Dark",
      comment: "Choice of the Theme menu in Settings: Meru is always dark",
    }),
  };

  const strengths: Record<ProfileTintStrength, string> = {
    low: t({
      message: "Low",
      comment:
        "Choice of the Tint strength menu in Settings: a little of the profile's color in the title bar and sidebar",
    }),
    medium: t({
      message: "Medium",
      comment:
        "Choice of the Tint strength menu in Settings: some of the profile's color in the title bar and sidebar",
    }),
    high: t({
      message: "High",
      comment:
        "Choice of the Tint strength menu in Settings: the most of the profile's color in the title bar and sidebar",
    }),
  };

  return (
    <SettingGroups>
      <SettingGroup>
        <Rows>
          {[
            <SettingRow
              key="theme"
              label={t({
                message: "Theme",
                comment:
                  "Label of the menu in Settings choosing whether Meru is light, dark or as the system is",
              })}
              description={t({
                message: "Gmail has its own theme, which you set in Gmail.",
                comment:
                  "Description of the Theme menu in Settings; Meru's theme does not change Gmail's, which is set in Gmail's own settings",
              })}
            >
              {(ids) => (
                <Select
                  items={THEMES.map((theme) => ({
                    value: theme,
                    label: themes[theme],
                  }))}
                  value={settings.theme}
                  onValueChange={(theme) => {
                    if (theme !== null) {
                      write({ key: "theme", value: theme });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-labelledby={ids.label}
                    aria-describedby={ids.description || undefined}
                    className="min-w-28"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {THEMES.map((theme) => (
                        <SelectItem key={theme} value={theme}>
                          {themes[theme]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SettingRow>,
            switchRow({
              key: "profileTint",
              label: t({
                message: "Tint with profile color",
                comment:
                  "Label of the switch in Settings that mixes the selected profile's color into the title bar and the sidebar",
              }),
              description: t({
                message:
                  "Adds a touch of the profile color to the title bar and sidebar.",
                comment:
                  "Description of the Tint with profile color switch in Settings",
              }),
            }),
            <SettingRow
              key="profileTintStrength"
              label={t({
                message: "Tint strength",
                comment:
                  "Label of the menu in Settings choosing how much of the selected profile's color the title bar and the sidebar take",
              })}
              description={
                settings.profileTint
                  ? undefined
                  : t({
                      message: "Turn on Tint with profile color first.",
                      comment:
                        "Description of the Tint strength menu in Settings while Tint with profile color, the switch above it, is off; it says what to do to use the menu",
                    })
              }
              disabled={!settings.profileTint}
            >
              {(ids) => (
                <Select
                  items={PROFILE_TINT_STRENGTHS.map((strength) => ({
                    value: strength,
                    label: strengths[strength],
                  }))}
                  value={settings.profileTintStrength}
                  disabled={!settings.profileTint}
                  onValueChange={(strength) => {
                    if (strength !== null) {
                      write({ key: "profileTintStrength", value: strength });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-labelledby={ids.label}
                    aria-describedby={ids.description || undefined}
                    className="min-w-28"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {PROFILE_TINT_STRENGTHS.map((strength) => (
                        <SelectItem key={strength} value={strength}>
                          {strengths[strength]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SettingRow>,
          ]}
        </Rows>
      </SettingGroup>
      <SettingGroup
        title={t({
          message: "Title bar buttons",
          comment:
            "Heading of the group of Settings with a switch for each button at the right of the title bar",
        })}
      >
        <Rows>
          {[
            switchRow({
              key: "titlebarNewTab",
              label: t({
                message: "New tab",
                comment:
                  "Label of the switch in Settings that shows the New tab button in the title bar; New tab is the button's name",
              }),
              description: t({
                message: "Shows only when the sidebar is hidden.",
                comment:
                  "Description of the New tab switch in Settings; the button is in the title bar only while the sidebar is hidden",
              }),
            }),
            switchRow({
              key: "titlebarUnifiedInbox",
              label: t({
                message: "Unified inbox",
                comment:
                  "Label of the switch in Settings that shows the Unified inbox button in the title bar; Unified inbox is the feature's name",
              }),
              description: t({
                message: "Shows only when you have two or more profiles.",
                comment:
                  "Description of the Unified inbox switch in Settings; the button is in the title bar only with two or more profiles",
              }),
            }),
            switchRow({
              key: "titlebarDownloads",
              label: t({
                message: "Downloads",
                comment:
                  "Label of the switch in Settings that shows the Downloads button in the title bar",
              }),
            }),
            switchRow({
              key: "titlebarDoNotDisturb",
              label: t({
                message: "Do Not Disturb",
                comment:
                  "Label of the switch in Settings that shows the Do Not Disturb button, a moon, in the title bar; Do Not Disturb is the feature's name",
              }),
              description: t({
                message:
                  "When hidden, it still shows while Do Not Disturb is on.",
                comment:
                  "Description of the Do Not Disturb switch in Settings; turned off, the moon button still shows in the title bar while Do Not Disturb is on",
              }),
            }),
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
