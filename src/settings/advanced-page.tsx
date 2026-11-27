import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { CheckIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "#ui/button.tsx";
import { Switch } from "#ui/switch.tsx";

import { useDoneBriefly } from "./done-briefly.ts";
import { onMacOS } from "./menu-bar-page.tsx";
import { useNeedsPro } from "./pro-badge.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/** Clear cache, disabled while it runs, then Cleared for a moment. */
const ClearCache = ({
  describedBy,
  onDone,
}: {
  describedBy: string;
  onDone: (failed: boolean) => void;
}) => {
  const { t } = useLingui();
  const [clearing, setClearing] = useState(false);
  const [cleared, showCleared] = useDoneBriefly();
  const clearedLabel = t({
    message: "Cleared",
    comment:
      "The Clear cache button on the Advanced page of Settings for a moment after every profile's cache was cleared",
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={clearing}
        aria-describedby={describedBy || undefined}
        onClick={async () => {
          setClearing(true);
          onDone(false);

          const failed = await settingsCalls()
            .clearCache({})
            .then(() => false)
            .catch(() => true);

          setClearing(false);
          onDone(failed);

          if (!failed) {
            showCleared();
          }
        }}
      >
        {cleared && <CheckIcon data-icon="inline-start" aria-hidden />}
        {cleared
          ? clearedLabel
          : t({
              message: "Clear cache",
              comment:
                "Button on the Advanced page of Settings that clears the saved pages and images of every profile",
            })}
      </Button>
      <output className="sr-only">{cleared && clearedLabel}</output>
    </>
  );
};

/** Export…, disabled while the Save dialog is up, then Saved for a moment. */
const ExportLogs = ({
  describedBy,
  onDone,
}: {
  describedBy: string;
  onDone: (failed: boolean) => void;
}) => {
  const { t } = useLingui();
  const [exporting, setExporting] = useState(false);
  const [saved, showSaved] = useDoneBriefly();
  const savedLabel = t({
    message: "Saved",
    comment:
      "The Export button of the Logs row in Settings for a moment after a copy of the logs was saved",
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={exporting}
        aria-label={t({
          message: "Export logs",
          comment:
            "Accessible name of the Export button of the Logs row in Settings, which saves a copy of the app's logs",
        })}
        aria-describedby={describedBy || undefined}
        onClick={async () => {
          setExporting(true);
          onDone(false);

          const answer = await settingsCalls()
            .exportLogs({})
            .catch(() => "failed" as const);

          setExporting(false);
          onDone(answer === "failed");

          if (answer === "saved") {
            showSaved();
          }
        }}
      >
        {saved && <CheckIcon data-icon="inline-start" aria-hidden />}
        {saved
          ? savedLabel
          : t({
              message: "Export…",
              comment:
                "Button of the Logs row in Settings that shows the Save dialog for a copy of the app's logs",
            })}
      </Button>
      <output className="sr-only">{saved && savedLabel}</output>
    </>
  );
};

/**
 * Hardware acceleration, which applies at the next launch, the macOS screen
 * picker, and the troubleshooting that needs no setting: app-wide alone, so
 * the page has no scopes.
 */
export const AdvancedPage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");
  const advanced = useSettingsState("advanced");
  const [clearFailed, setClearFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const needsPro = useNeedsPro();

  if (!settings || !advanced) {
    return null;
  }

  const calls = settingsCalls();
  const restartPending =
    settings.hardwareAcceleration !== advanced.hardwareAccelerationAtLaunch;
  const pickerPro = needsPro.setting("systemScreenPicker");

  return (
    <SettingGroups>
      <SettingGroup>
        <Rows>
          {[
            <SettingRow
              key="hardwareAcceleration"
              label={t({
                message: "Use hardware acceleration",
                comment:
                  "Label of the switch in Settings that lets Meru draw pages with the graphics card",
              })}
              description={
                restartPending
                  ? t({
                      message:
                        "Turn this off if pages flicker or stay blank. Restart Meru to apply the change.",
                      comment:
                        "Description of the Use hardware acceleration switch in Settings once it was changed, which applies only when Meru starts again",
                    })
                  : t({
                      message:
                        "Turn this off if pages flicker or stay blank. You'll need to restart Meru.",
                      comment:
                        "Description of the Use hardware acceleration switch in Settings, which applies only when Meru starts again",
                    })
              }
            >
              {(ids) => (
                <Switch
                  checked={settings.hardwareAcceleration}
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description || undefined}
                  onCheckedChange={(checked) => {
                    calls
                      .update({ key: "hardwareAcceleration", value: checked })
                      .catch(noop);
                  }}
                />
              )}
            </SettingRow>,
            // The row is absent elsewhere, so it draws no separator there.
            ...(onMacOS()
              ? [
                  <SettingRow
                    key="systemScreenPicker"
                    label={t({
                      message: "Use the macOS screen picker",
                      comment:
                        "Label of the switch in Settings, on macOS only, that has macOS rather than Meru ask which screen or window a page such as Google Meet shares",
                    })}
                    description={t({
                      message:
                        "macOS asks which screen or window you want to share.",
                      comment:
                        "Description of the Use the macOS screen picker switch in Settings",
                    })}
                    disabled={pickerPro}
                    pro={pickerPro}
                  >
                    {(ids) => (
                      <Switch
                        checked={settings.systemScreenPicker}
                        disabled={pickerPro}
                        aria-labelledby={ids.label}
                        aria-describedby={ids.description || undefined}
                        onCheckedChange={(checked) => {
                          calls
                            .update({
                              key: "systemScreenPicker",
                              value: checked,
                            })
                            .catch(noop);
                        }}
                      />
                    )}
                  </SettingRow>,
                ]
              : []),
          ]}
        </Rows>
      </SettingGroup>
      <SettingGroup
        title={t({
          message: "Troubleshooting",
          comment:
            "Title of the group of Settings for opening the settings file, clearing the cache and exporting the logs, when something goes wrong",
        })}
      >
        <Rows>
          {[
            <SettingRow
              key="settingsFile"
              label={t({
                message: "Settings file",
                comment:
                  "Label of the row in Settings that opens settings.json, the file Meru keeps its settings in",
              })}
              description={t({
                message: "Opens settings.json in your text editor.",
                comment:
                  "Description of the Settings file row in Settings; settings.json is the file's name",
              })}
            >
              {(ids) => (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t({
                    message: "Open settings file",
                    comment:
                      "Accessible name of the Open button of the Settings file row in Settings, which opens settings.json",
                  })}
                  aria-describedby={ids.description || undefined}
                  onClick={() => {
                    calls.openSettingsFile({}).catch(noop);
                  }}
                >
                  {t({
                    message: "Open",
                    comment:
                      "Button of the Settings file row in Settings that opens settings.json in the text editor",
                  })}
                </Button>
              )}
            </SettingRow>,
            <SettingRow
              key="cache"
              label={t({
                message: "Cache",
                comment:
                  "Label of the row in Settings that clears the saved pages and images of every profile",
              })}
              description={t({
                message: "Clears saved pages and images for all profiles.",
                comment: "Description of the Cache row in Settings",
              })}
              error={
                clearFailed
                  ? t({
                      message: "Couldn't clear the cache. Try again.",
                      comment:
                        "Under the Cache row in Settings, when clearing the cache of some profile failed",
                    })
                  : undefined
              }
            >
              {(ids) => (
                <ClearCache
                  describedBy={ids.description}
                  onDone={setClearFailed}
                />
              )}
            </SettingRow>,
            <SettingRow
              key="logs"
              label={t({
                message: "Logs",
                comment:
                  "Label of the row in Settings that saves a copy of the app's logs, a record of its own events and errors without anything personal",
              })}
              description={t({
                message: "Save a copy of the logs to send to support.",
                comment: "Description of the Logs row in Settings",
              })}
              error={
                exportFailed
                  ? t({
                      message: "Couldn't save the logs. Try again.",
                      comment:
                        "Under the Logs row in Settings, when the copy of the logs could not be written",
                    })
                  : undefined
              }
            >
              {(ids) => (
                <ExportLogs
                  describedBy={ids.description}
                  onDone={setExportFailed}
                />
              )}
            </SettingRow>,
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
