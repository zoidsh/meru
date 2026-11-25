import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import type { SettingChange } from "#contract/settings.ts";
import { canHideDock, dockShown } from "#core/dock.ts";
import { TRAY_ICON_COLORS } from "#core/settings.ts";
import type { TrayIconColor } from "#core/settings.ts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

type SwitchKey = "dockIcon" | "tray" | "trayUnreadCount" | "trayJumpsToUnread";

/** Whether the window runs on macOS, where the page is Menu Bar & Dock. */
export const onMacOS = () =>
  document.documentElement.dataset.platform === "darwin";

/**
 * Meru's icons outside its window: the Dock and the menu bar on macOS, the
 * system tray elsewhere. App settings alone, so the page has no scopes.
 */
export const MenuBarPage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");

  if (!settings) {
    return null;
  }

  const calls = settingsCalls();
  // Main refuses the Dock icon off while the menu bar icon is off, which the
  // page then shows as it stands.
  const write = (change: SettingChange) => {
    calls.update(change).catch(noop);
  };
  const mac = onMacOS();
  const trayOff = !settings.tray;
  const trayLabel = mac
    ? t({
        message: "Show in menu bar",
        comment:
          "Label of the switch in Settings on macOS that shows Meru's icon in the menu bar at the top of the screen",
      })
    : t({
        message: "Show in system tray",
        comment:
          "Label of the switch in Settings on Windows and Linux that shows Meru's icon in the system tray",
      });
  const trayOffReason = mac
    ? t({
        message: "Turn on Show in menu bar first.",
        comment:
          "Description of a setting in Settings on macOS while Show in menu bar, the switch it depends on, is off; it says what to do to use the setting",
      })
    : t({
        message: "Turn on Show in system tray first.",
        comment:
          "Description of a setting in Settings on Windows and Linux while Show in system tray, the switch it depends on, is off; it says what to do to use the setting",
      });

  const switchRow = ({
    key,
    label,
    description,
    disabled = false,
    checked,
  }: {
    key: SwitchKey;
    label: string;
    description?: string | undefined;
    disabled?: boolean;
    checked?: boolean;
  }) => (
    <SettingRow
      key={key}
      label={label}
      description={description}
      disabled={disabled}
    >
      {(ids) => (
        <Switch
          checked={checked ?? settings[key]}
          disabled={disabled}
          aria-labelledby={ids.label}
          aria-describedby={ids.description || undefined}
          onCheckedChange={(on) => {
            write({ key, value: on });
          }}
        />
      )}
    </SettingRow>
  );

  const iconColors: Record<TrayIconColor, string> = {
    system: t({
      message: "System",
      comment:
        "Choice of the Icon color menu in Settings: the tray icon follows the system's light or dark mode",
    }),
    light: t({
      message: "Light",
      comment: "Choice of the Icon color menu in Settings: a light tray icon",
    }),
    dark: t({
      message: "Dark",
      comment: "Choice of the Icon color menu in Settings: a dark tray icon",
    }),
  };
  const dockLocked = !canHideDock({ tray: settings.tray });

  const jumpRow = switchRow({
    key: "trayJumpsToUnread",
    label: t({
      message: "Jump to unread mail",
      comment:
        "Label of the switch in Settings that makes a click on Meru's menu bar or tray icon open the first profile with unread mail",
    }),
    description: trayOff
      ? trayOffReason
      : t({
          message:
            "Clicking the icon opens the first profile that has unread mail.",
          comment:
            "Description of the Jump to unread mail switch in Settings; the icon is Meru's in the menu bar or the system tray",
        }),
    disabled: trayOff,
  });

  return (
    <SettingGroups>
      {mac && (
        <SettingGroup
          title={t({
            message: "Dock",
            comment:
              "Heading of the group of Settings on macOS for Meru's icon in the Dock; the Dock is macOS's own name",
          })}
        >
          <Rows>
            {[
              switchRow({
                key: "dockIcon",
                label: t({
                  message: "Show in Dock",
                  comment:
                    "Label of the switch in Settings on macOS that shows Meru's icon in the Dock",
                }),
                description: dockLocked
                  ? trayOffReason
                  : t({
                      message:
                        "If you hide it, you can still open Meru from the menu bar.",
                      comment:
                        "Description of the Show in Dock switch in Settings; Meru's icon in the menu bar opens it while the Dock icon is hidden",
                    }),
                disabled: dockLocked,
                // What the Dock shows, which a file with both off still is.
                checked: dockShown(settings),
              }),
            ]}
          </Rows>
        </SettingGroup>
      )}
      <SettingGroup
        title={
          mac
            ? t({
                message: "Menu bar",
                comment:
                  "Heading of the group of Settings on macOS for Meru's icon in the menu bar at the top of the screen",
              })
            : t({
                message: "System tray",
                comment:
                  "Heading of the group of Settings on Windows and Linux for Meru's icon in the system tray",
              })
        }
      >
        <Rows>
          {[
            switchRow({
              key: "tray",
              label: trayLabel,
              description: mac
                ? undefined
                : t({
                    message:
                      "Meru keeps running in the tray when you close its window.",
                    comment:
                      "Description of the Show in system tray switch in Settings on Windows and Linux",
                  }),
            }),
            mac ? (
              switchRow({
                key: "trayUnreadCount",
                label: t({
                  message: "Show unread count",
                  comment:
                    "Label of the switch in Settings on macOS that shows the unread count beside Meru's menu bar icon",
                }),
                description: trayOff ? trayOffReason : undefined,
                disabled: trayOff,
              })
            ) : (
              <SettingRow
                key="trayIconColor"
                label={t({
                  message: "Icon color",
                  comment:
                    "Label of the menu in Settings on Windows and Linux choosing the color of Meru's tray icon",
                })}
                description={
                  trayOff
                    ? trayOffReason
                    : t({
                        message: "System changes with light and dark mode.",
                        comment:
                          "Description of the Icon color menu in Settings; System is the menu's first choice",
                      })
                }
                disabled={trayOff}
              >
                {(ids) => (
                  <Select
                    items={TRAY_ICON_COLORS.map((color) => ({
                      value: color,
                      label: iconColors[color],
                    }))}
                    value={settings.trayIconColor}
                    disabled={trayOff}
                    onValueChange={(color) => {
                      if (color !== null) {
                        write({ key: "trayIconColor", value: color });
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
                        {TRAY_ICON_COLORS.map((color) => (
                          <SelectItem key={color} value={color}>
                            {iconColors[color]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </SettingRow>
            ),
            jumpRow,
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
