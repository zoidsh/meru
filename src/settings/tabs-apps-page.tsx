import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { ChevronDownIcon } from "lucide-react";
import { useId } from "react";

import { APPS } from "#core/apps.ts";
import { Button } from "#ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "#ui/dropdown-menu.tsx";
import { Switch } from "#ui/switch.tsx";

import { useCheckedSummary } from "./checked-summary.ts";
import { useNeedsPro } from "./pro-badge.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/** Every Google app but Gmail, which always opens in Meru. */
const OFFERED = APPS.filter((app) => app.id !== "gmail");

/**
 * Whether a link or New tab opens a Google app in Meru, and which always
 * leave for the default browser: app settings alone, so the page has no
 * scopes.
 */
export const TabsAppsPage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");
  const needsPro = useNeedsPro();
  const summaryId = useId();
  const excluded = settings?.appsInDefaultBrowser ?? [];
  const summary = useCheckedSummary(
    OFFERED.filter((app) => excluded.includes(app.id)).map((app) => app.name)
  );

  if (!settings) {
    return null;
  }

  const calls = settingsCalls();
  const inMeruPro = needsPro.setting("openAppsInMeru");
  const excludedPro = needsPro.setting("appsInDefaultBrowser");
  // On the free version the row says Pro, not to turn the switch on.
  const excludedOff = !settings.openAppsInMeru && !excludedPro;

  return (
    <SettingGroups>
      <SettingGroup
        title={t({
          message: "Opening Google apps",
          comment:
            "Title of the group of Settings for whether links to Google apps, such as Calendar or Drive, open in Meru or in the default browser",
        })}
      >
        <Rows>
          {[
            <SettingRow
              key="openAppsInMeru"
              label={t({
                message: "Open Google apps in Meru",
                comment:
                  "Label of the switch in Settings that has links to Google apps, such as Calendar or Drive, open as tabs in Meru rather than in the default browser",
              })}
              description={
                settings.openAppsInMeru
                  ? undefined
                  : t({
                      message: "Google apps open in your default browser.",
                      comment:
                        "Description of the Open Google apps in Meru switch in Settings while it is off",
                    })
              }
              disabled={inMeruPro}
              pro={inMeruPro}
            >
              {(ids) => (
                <Switch
                  checked={settings.openAppsInMeru}
                  disabled={inMeruPro}
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description || undefined}
                  onCheckedChange={(checked) => {
                    calls
                      .update({ key: "openAppsInMeru", value: checked })
                      .catch(noop);
                  }}
                />
              )}
            </SettingRow>,
            <SettingRow
              key="appsInDefaultBrowser"
              label={t({
                message: "Always open in your default browser",
                comment:
                  "Label of the menu in Settings choosing the Google apps whose links always open in the default browser rather than in Meru",
              })}
              description={
                excludedOff
                  ? t({
                      message: "Turn on Open Google apps in Meru first.",
                      comment:
                        "Description of the Always open in your default browser row in Settings while Open Google apps in Meru, the switch above it, is off; it says what to do to use the row",
                    })
                  : undefined
              }
              disabled={excludedOff || excludedPro}
              pro={excludedPro}
            >
              {(ids) => (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={excludedOff || excludedPro}
                    render={
                      <Button
                        variant="outline"
                        aria-labelledby={`${ids.label} ${summaryId}`}
                        aria-describedby={ids.description || undefined}
                      />
                    }
                  >
                    <span id={summaryId}>{summary}</span>
                    <ChevronDownIcon data-icon="inline-end" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      {OFFERED.map((app) => (
                        <DropdownMenuCheckboxItem
                          key={app.id}
                          checked={excluded.includes(app.id)}
                          closeOnClick={false}
                          onCheckedChange={(on) => {
                            calls
                              .setAppInDefaultBrowser({ app: app.id, on })
                              .catch(noop);
                          }}
                        >
                          {app.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </SettingRow>,
          ]}
        </Rows>
      </SettingGroup>
    </SettingGroups>
  );
};
