import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import type { SettingChange } from "#contract/settings.ts";
import { Button } from "#ui/button.tsx";
import { Switch } from "#ui/switch.tsx";

import { LanguageGroup } from "./language-group.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

type SwitchKey =
  | "openInBackground"
  | "downloadsSaveAs"
  | "downloadsShowInFolder";

const platform = () => document.documentElement.dataset.platform;

/**
 * Meru's language and spelling, how it starts and where downloads go. App
 * settings alone, so the page
 * has no scopes; the login item and the folder are main's to set, through
 * calls of their own.
 */
export const GeneralPage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");
  const general = useSettingsState("general");

  if (!settings || !general) {
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
    <SettingRow key={key} label={label} description={description}>
      {(ids) => (
        <Switch
          checked={settings[key]}
          aria-labelledby={ids.label}
          aria-describedby={ids.description || undefined}
          onCheckedChange={(on) => {
            write({ key, value: on });
          }}
        />
      )}
    </SettingRow>
  );

  const { openAtLogin, downloadsFolder } = general;
  const fileManager = {
    darwin: t({
      message: "Show files in Finder when done",
      comment:
        "Label of the switch in Settings on macOS that shows each finished download in Finder; Finder is macOS's own name",
    }),
    win32: t({
      message: "Show files in File Explorer when done",
      comment:
        "Label of the switch in Settings on Windows that shows each finished download in File Explorer; File Explorer is Windows's own name",
    }),
  }[platform() ?? ""];

  return (
    <SettingGroups>
      <LanguageGroup
        language={settings.language}
        spellcheckLanguages={settings.spellcheckLanguages}
        general={general}
        write={write}
      />
      <SettingGroup
        title={t({
          message: "Startup",
          comment:
            "Heading of the group of Settings about how Meru starts: at login, and without showing its window",
        })}
      >
        <Rows>
          {[
            ...(openAtLogin
              ? [
                  <SettingRow
                    key="openAtLogin"
                    label={t({
                      message: "Open at login",
                      comment:
                        "Label of the switch in Settings that has the system open Meru when the person logs in to the computer",
                    })}
                    description={
                      openAtLogin.real
                        ? undefined
                        : t({
                            message:
                              "This development build never opens at login.",
                            comment:
                              "Description of the Open at login switch in Settings in a build that is not an installed release, where the switch changes nothing in the system",
                          })
                    }
                  >
                    {(ids) => (
                      <Switch
                        checked={openAtLogin.on}
                        aria-labelledby={ids.label}
                        aria-describedby={ids.description || undefined}
                        onCheckedChange={(on) => {
                          calls.setOpenAtLogin({ on }).catch(noop);
                        }}
                      />
                    )}
                  </SettingRow>,
                ]
              : []),
            switchRow({
              key: "openInBackground",
              label: t({
                message: "Open in the background",
                comment:
                  "Label of the switch in Settings that starts Meru without showing its window",
              }),
              description: t({
                message: "Starts Meru without showing its window.",
                comment:
                  "Description of the Open in the background switch in Settings",
              }),
            }),
          ]}
        </Rows>
      </SettingGroup>
      <SettingGroup
        title={t({
          message: "Downloads",
          comment:
            "Heading of the group of Settings about where downloads are saved and what happens when one finishes",
        })}
      >
        <Rows>
          {[
            <SettingRow
              key="downloadsFolder"
              label={t({
                message: "Save downloads to",
                comment:
                  "Label of the row in Settings showing the folder downloads are saved to, with a button to change it",
              })}
              description={
                <span className="break-all">{downloadsFolder.path}</span>
              }
              notice={
                downloadsFolder.available
                  ? undefined
                  : t({
                      message:
                        "This folder isn't available. Downloads go to Downloads until it's back.",
                      comment:
                        "Description of the Save downloads to row in Settings while the chosen folder is missing or cannot be written; Downloads is the system's Downloads folder",
                    })
              }
            >
              {(ids) => (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t({
                    message: "Change where downloads are saved",
                    comment:
                      "Accessible name of the Change… button in Settings that opens the system's folder picker for where downloads are saved",
                  })}
                  aria-describedby={ids.description || undefined}
                  onClick={() => {
                    calls.chooseDownloadsFolder({}).catch(noop);
                  }}
                >
                  {t({
                    message: "Change…",
                    comment:
                      "Button in Settings beside the downloads folder that opens the system's folder picker",
                  })}
                </Button>
              )}
            </SettingRow>,
            switchRow({
              key: "downloadsSaveAs",
              label: t({
                message: "Ask where to save each file",
                comment:
                  "Label of the switch in Settings that has each download open the system's save dialog",
              }),
            }),
            switchRow({
              key: "downloadsShowInFolder",
              label:
                fileManager ??
                t({
                  message: "Show files in the file manager when done",
                  comment:
                    "Label of the switch in Settings on Linux that shows each finished download in the desktop's file manager",
                }),
            }),
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
