import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";

import { TABS_APPS_OVERRIDABLE_KEYS } from "#contract/settings.ts";
import { APPS } from "#core/apps.ts";
import { OPEN_APPS_IN, SLEEP_AFTER, SLEEP_IDLE_TABS } from "#core/settings.ts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { AppsInBrowserDialog } from "./apps-in-browser-dialog.tsx";
import { dependentRow } from "./opening-rows.ts";
import { usePageScope } from "./page-scope.tsx";
import { useNeedsPro } from "./pro-badge.tsx";
import { effectiveSettings, switchValueText } from "./scope.ts";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/** Every Google app but Gmail, which always opens in Meru, in the launcher's order. */
const OFFERED = APPS.filter((app) => app.id !== "gmail");

/**
 * Whether a link or New tab opens a Google app in Meru, as a tab or in a
 * window of its own, and which always leave for the default browser, each
 * of which a profile may set for itself; whether the sidebar lists windows,
 * and which idle tabs sleep after how long, which only the app sets and a
 * profile's scope leaves out.
 */
export const TabsAppsPage = () => {
  const { t } = useLingui();
  const settings = useSettingsState("settings");
  const profiles = useSettingsState("profiles");
  const needsPro = useNeedsPro();
  const { profile, rowScope, page } = usePageScope(
    profiles,
    TABS_APPS_OVERRIDABLE_KEYS
  );

  if (!settings || !profiles) {
    return null;
  }

  const values = effectiveSettings(settings, profile);
  const excluded = values.appsInDefaultBrowser;
  const countText = (list: readonly string[], inCaption = false) => {
    // An id this build does not know stays stored, uncounted.
    const count = OFFERED.filter((app) => list.includes(app.id)).length;

    if (count === 0) {
      return inCaption
        ? t({
            message: "none",
            context: "Google apps",
            comment:
              "Always open in your default browser under All profiles when no Google app is chosen, in the Settings caption under a profile's own value: For all profiles, it's none.",
          })
        : t({
            message: "None",
            comment:
              "Description of the Always open in your default browser row in Settings while no Google app is chosen to open in the default browser",
          });
    }

    return t({
      message: plural(count, {
        one: "# Google app",
        other: "# Google apps",
      }),
      comment:
        "Description of the Always open in your default browser row in Settings: how many Google apps, such as Calendar or Drive, are chosen to open in the default browser; also the app value in a profile's caption: For all profiles, it's 3 Google apps.",
    });
  };
  const excludedLabel = t({
    message: "Always open in your default browser",
    comment:
      "Label of the row in Settings for the Google apps whose links always open in the default browser rather than in Meru, and title of the dialog that chooses them",
  });

  const calls = settingsCalls();
  const inMeruPro = needsPro.setting("openAppsInMeru");
  const excludedPro = needsPro.setting("appsInDefaultBrowser");
  const turnOnFirst = () =>
    t({
      message: "Turn on Open Google apps in Meru first.",
      comment:
        "Description of a row in Settings under Open Google apps in Meru, such as Always open in your default browser or Open Google apps in, while that switch is off; it says what to do to use the row",
    });
  const excludedState = dependentRow({
    inMeru: values.openAppsInMeru,
    needsPro: excludedPro,
  });
  const excludedDescription =
    excludedState === "turn-on-first" ? turnOnFirst() : countText(excluded);
  const openInPro = needsPro.setting("openAppsIn");
  const openInState = dependentRow({
    inMeru: values.openAppsInMeru,
    needsPro: openInPro,
  });
  const openInLabel = t({
    message: "Open Google apps in",
    comment:
      "Label of the menu in Settings choosing whether a Google app opened next, such as Calendar or Drive, arrives as a tab in the main window or in a new window of its own",
  });
  const openAppsIn = {
    tabs: t({
      message: "Tabs",
      context: "Open Google apps in",
      comment:
        "Option of the Open Google apps in menu in Settings: each Google app opened next arrives as a tab in the main window; also the app value in a profile's caption: For all profiles, it's Tabs.",
    }),
    windows: t({
      message: "New window",
      context: "Open Google apps in",
      comment:
        "Option of the Open Google apps in menu in Settings: each Google app opened next arrives in a new window of its own, as Move to New Window puts a tab; also the app value in a profile's caption: For all profiles, it's New window.",
    }),
  };
  const showWindowsPro = needsPro.setting("showWindowsInSidebar");
  const showWindowsLabel = t({
    message: "Show windows in the sidebar",
    comment:
      "Label of the switch in Settings that lists the tabs moved to windows of their own in the main window's sidebar",
  });
  const inMeruLabel = t({
    message: "Open Google apps in Meru",
    comment:
      "Label of the switch in Settings that has links to Google apps, such as Calendar or Drive, open as tabs in Meru rather than in the default browser",
  });

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

  return page(
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
              label={inMeruLabel}
              description={
                values.openAppsInMeru
                  ? undefined
                  : t({
                      message: "Google apps open in your default browser.",
                      comment:
                        "Description of the Open Google apps in Meru switch in Settings while it is off",
                    })
              }
              scope={rowScope("openAppsInMeru", inMeruLabel, () =>
                switchValueText(settings.openAppsInMeru)
              )}
              disabled={inMeruPro}
              pro={inMeruPro}
            >
              {(ids) => (
                <Switch
                  checked={values.openAppsInMeru}
                  disabled={inMeruPro}
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description || undefined}
                  onCheckedChange={(checked) => {
                    const change = {
                      key: "openAppsInMeru",
                      value: checked,
                    } as const;

                    // Main refuses a profile removed since the page last
                    // heard, and the page then shows main's state.
                    (profile
                      ? calls.setOverride({ ...change, profileId: profile.id })
                      : calls.update(change)
                    ).catch(noop);
                  }}
                />
              )}
            </SettingRow>,
            <SettingRow
              key="openAppsIn"
              label={openInLabel}
              description={
                openInState === "turn-on-first" ? turnOnFirst() : undefined
              }
              scope={rowScope(
                "openAppsIn",
                openInLabel,
                () => openAppsIn[settings.openAppsIn]
              )}
              disabled={openInState !== undefined}
              pro={openInPro}
            >
              {(ids) => (
                <Select
                  items={OPEN_APPS_IN.map((where) => ({
                    value: where,
                    label: openAppsIn[where],
                  }))}
                  value={values.openAppsIn}
                  disabled={openInState !== undefined}
                  onValueChange={(where) => {
                    if (where === null) {
                      return;
                    }

                    const change = { key: "openAppsIn", value: where } as const;

                    // Main refuses a profile removed since the page last
                    // heard, and the page then shows main's state.
                    (profile
                      ? calls.setOverride({ ...change, profileId: profile.id })
                      : calls.update(change)
                    ).catch(noop);
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
                      {OPEN_APPS_IN.map((where) => (
                        <SelectItem key={where} value={where}>
                          {openAppsIn[where]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SettingRow>,
            <SettingRow
              key="appsInDefaultBrowser"
              label={excludedLabel}
              description={excludedDescription}
              scope={rowScope("appsInDefaultBrowser", excludedLabel, () =>
                countText(settings.appsInDefaultBrowser, true)
              )}
              disabled={excludedState !== undefined}
              pro={excludedPro}
            >
              {(ids) => (
                <AppsInBrowserDialog
                  apps={OFFERED}
                  chosen={excluded}
                  profileId={profile?.id ?? null}
                  title={excludedLabel}
                  disabled={excludedState !== undefined}
                  describedBy={ids.description}
                />
              )}
            </SettingRow>,
          ]}
        </Rows>
      </SettingGroup>
      {!profile && (
        <SettingGroup
          title={t({
            message: "Sidebar",
            context: "settings group",
            comment:
              "Title of the group of Settings for what the main window's sidebar lists",
          })}
        >
          <Rows>
            {[
              <SettingRow
                key="showWindowsInSidebar"
                label={showWindowsLabel}
                description={t({
                  message:
                    "Lists Google app windows with your tabs so you can switch to them.",
                  comment:
                    "Description of the Show windows in the sidebar switch in Settings",
                })}
                disabled={showWindowsPro}
                pro={showWindowsPro}
              >
                {(ids) => (
                  <Switch
                    checked={settings.showWindowsInSidebar}
                    disabled={showWindowsPro}
                    aria-labelledby={ids.label}
                    aria-describedby={ids.description || undefined}
                    onCheckedChange={(checked) => {
                      calls
                        .update({ key: "showWindowsInSidebar", value: checked })
                        .catch(noop);
                    }}
                  />
                )}
              </SettingRow>,
            ]}
          </Rows>
        </SettingGroup>
      )}
      {!profile && (
        <SettingGroup
          title={t({
            message: "Sleep",
            context: "settings group",
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
                  comment:
                    "Description of the Sleep idle tabs menu in Settings",
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
      )}
    </SettingGroups>
  );
};
