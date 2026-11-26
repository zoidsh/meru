import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { ChevronDownIcon } from "lucide-react";
import { useId } from "react";

import { APPS } from "#core/apps.ts";
import { SLEEP_AFTER, SLEEP_IDLE_TABS } from "#core/settings.ts";
import { Button } from "#ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "#ui/dropdown-menu.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { useCheckedSummary } from "./checked-summary.ts";
import { useNeedsPro } from "./pro-badge.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/** Every Google app but Gmail, which always opens in Meru. */
const OFFERED = APPS.filter((app) => app.id !== "gmail");

/**
 * Whether a link or New tab opens a Google app in Meru, which always leave
 * for the default browser, and which idle tabs sleep after how long: app
 * settings alone, so the page has no scopes.
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
  const sleepPro = needsPro.setting("sleepIdleTabs");
  const afterPro = needsPro.setting("sleepAfter");
  const sleepIdleTabs = {
    unpinned: t({
      message: "Unpinned tabs",
      comment:
        "Option of the Sleep idle tabs menu in Settings: every tab that is not pinned sleeps once idle",
    }),
    chosen: t({
      message: "Tabs you choose",
      comment:
        "Option of the Sleep idle tabs menu in Settings: only tabs marked Sleep When Idle in their context menu sleep once idle",
    }),
    all: t({
      message: "All tabs",
      comment:
        "Option of the Sleep idle tabs menu in Settings: every tab, pinned or not, sleeps once idle",
    }),
  };
  const sleepAfter = {
    "30m": t({
      message: "30 minutes",
      comment:
        "Option of the Sleep after menu in Settings: how long a tab goes unused before it sleeps",
    }),
    "1h": t({
      message: "1 hour",
      comment:
        "Option of the Sleep after menu in Settings: how long a tab goes unused before it sleeps",
    }),
    "3h": t({
      message: "3 hours",
      comment:
        "Option of the Sleep after menu in Settings: how long a tab goes unused before it sleeps",
    }),
    "6h": t({
      message: "6 hours",
      comment:
        "Option of the Sleep after menu in Settings: how long a tab goes unused before it sleeps",
    }),
  };

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
      <SettingGroup
        title={t({
          message: "Sleep",
          comment:
            "Title of the group of Settings for tabs that sleep by themselves, freeing their memory, once they go unused",
        })}
      >
        <Rows>
          {[
            <SettingRow
              key="sleepIdleTabs"
              label={t({
                message: "Sleep idle tabs",
                comment:
                  "Label of the menu in Settings choosing which tabs sleep by themselves once they go unused",
              })}
              description={t({
                message:
                  "Sleeping tabs free up memory and reload when you open them.",
                comment: "Description of the Sleep idle tabs menu in Settings",
              })}
              disabled={sleepPro}
              pro={sleepPro}
            >
              {(ids) => (
                <Select
                  items={SLEEP_IDLE_TABS.map((which) => ({
                    value: which,
                    label: sleepIdleTabs[which],
                  }))}
                  value={settings.sleepIdleTabs}
                  disabled={sleepPro}
                  onValueChange={(which) => {
                    if (which !== null) {
                      calls
                        .update({ key: "sleepIdleTabs", value: which })
                        .catch(noop);
                    }
                  }}
                >
                  <SelectTrigger
                    aria-labelledby={ids.label}
                    aria-describedby={ids.description || undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {SLEEP_IDLE_TABS.map((which) => (
                        <SelectItem key={which} value={which}>
                          {sleepIdleTabs[which]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SettingRow>,
            <SettingRow
              key="sleepAfter"
              label={t({
                message: "Sleep after",
                comment:
                  "Label of the menu in Settings choosing how long a tab goes unused before it sleeps by itself",
              })}
              description={t({
                message:
                  "Your current tab, tabs in separate windows and tabs playing sound stay awake.",
                comment:
                  "Description of the Sleep after menu in Settings, naming the tabs that never sleep by themselves",
              })}
              disabled={afterPro}
              pro={afterPro}
            >
              {(ids) => (
                <Select
                  items={SLEEP_AFTER.map((after) => ({
                    value: after,
                    label: sleepAfter[after],
                  }))}
                  value={settings.sleepAfter}
                  disabled={afterPro}
                  onValueChange={(after) => {
                    if (after !== null) {
                      calls
                        .update({ key: "sleepAfter", value: after })
                        .catch(noop);
                    }
                  }}
                >
                  <SelectTrigger
                    aria-labelledby={ids.label}
                    aria-describedby={ids.description || undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {SLEEP_AFTER.map((after) => (
                        <SelectItem key={after} value={after}>
                          {sleepAfter[after]}
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
    </SettingGroups>
  );
};
