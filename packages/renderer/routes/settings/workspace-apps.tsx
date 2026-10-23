import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { plural, select } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { byPlatform } from "@meru/shared/platform";
import { GMAIL_TAB_ID, verticalTabsGmailUnreadBadges, verticalTabsWidths } from "@meru/shared/tabs";
import {
  DEV_WORKSPACE_APPS_HIBERNATION_TIMEOUT,
  launcherAndBookmarksPlacements,
  type LauncherWorkspaceApp,
  launcherWorkspaceApps,
  type SupportedWorkspaceApp,
  workspaceApps,
  workspaceAppsHibernations,
  workspaceAppsHibernationTimeouts,
  workspaceAppsLauncherDisplays,
  workspaceAppsModes,
} from "@meru/shared/workspace-apps";
import { Button } from "@meru/ui/components/button";
import { ButtonGroup } from "@meru/ui/components/button-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@meru/ui/components/field";
import { Kbd } from "@meru/ui/components/kbd";
import { ChevronDownIcon, GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useMemo } from "react";
import type { Entries } from "type-fest";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { WorkspaceAppIcon } from "@/components/workspace-app-icon";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { useTabsStore } from "@/lib/stores";
import { platform } from "@/lib/utils";

function SortableLauncherAppItem({
  app,
  index,
  onRemove,
  disabled,
}: {
  app: LauncherWorkspaceApp;
  index: number;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: app, index, disabled });

  const { t } = useLingui();

  const label = launcherWorkspaceApps[app];

  return (
    <ButtonGroup ref={ref} className={isDragging ? "opacity-50" : undefined}>
      <Button
        ref={handleRef}
        variant="outline"
        size="xs"
        className="cursor-grab touch-none"
        disabled={disabled}
        aria-label={t`Drag ${label} to reorder`}
      >
        <GripVerticalIcon />
        <WorkspaceAppIcon app={app} className="size-3.5" />
        {label}
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t({
          message: `Remove ${label} from launcher`,
          comment:
            "Screen reader label of the button that takes a Workspace app out of the launcher; label is the app's name",
        })}
      >
        <XIcon />
      </Button>
    </ButtonGroup>
  );
}

export function WorkspaceAppsSettings() {
  const { config } = useConfig();

  const { i18n, t } = useLingui();

  // A unit list joins with a bare comma in English, where a conjunction would
  // put "and" between the two.
  const listFormat = useMemo(
    () => new Intl.ListFormat(i18n.locale, { type: "unit", style: "short" }),
    [i18n.locale],
  );

  const excludedAppsFieldId = useId();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const accountsTabs = useTabsStore((state) => state.accountsTabs);

  const hasOpenWorkspaceAppTabs = accountsTabs.some((accountTabs) =>
    accountTabs.tabs.some((tab) => tab.id !== GMAIL_TAB_ID && !tab.dormant && !tab.windowed),
  );

  const hasLoadOnLaunchWorkspaceApps = accountsTabs.some((accountTabs) =>
    accountTabs.tabs.some((tab) => tab.loadOnLaunch),
  );

  if (!config) {
    return;
  }

  const launcherApps = config["workspaceApps.launcherApps"];

  const availableApps = (Object.keys(launcherWorkspaceApps) as LauncherWorkspaceApp[]).filter(
    (app) => !launcherApps.includes(app),
  );

  const excludedApps = config["workspaceApps.openInAppExcludedApps"];

  const excludedAppLabels = (Object.keys(workspaceApps) as SupportedWorkspaceApp[])
    .filter((app) => excludedApps.includes(app))
    .map((app) => workspaceApps[app].label);

  const visibleExcludedAppLabels = excludedAppLabels.slice(0, 3);

  const remainingExcludedAppCount = excludedAppLabels.length - visibleExcludedAppLabels.length;

  const noExcludedAppsLabel = t({
    message: "None",
    comment: "The Excluded apps field when no Workspace app is excluded",
  });

  const visibleExcludedApps = listFormat.format(visibleExcludedAppLabels);

  const excludedAppsSummary =
    excludedAppLabels.length === 0
      ? noExcludedAppsLabel
      : remainingExcludedAppCount > 0
        ? t({
            message: plural(remainingExcludedAppCount, {
              one: `${visibleExcludedApps} +# excluded`,
              other: `${visibleExcludedApps} +# excluded`,
            }),
            comment:
              "The Excluded apps field once more than three apps are excluded: the names of the first three, then how many more are excluded",
          })
        : visibleExcludedApps;

  const workspaceAppsInUse =
    hasOpenWorkspaceAppTabs && hasLoadOnLaunchWorkspaceApps
      ? "both"
      : hasOpenWorkspaceAppTabs
        ? "openTabs"
        : hasLoadOnLaunchWorkspaceApps
          ? "loadOnLaunch"
          : "none";

  const modeSwitchDescription = t({
    message: select(workspaceAppsInUse, {
      both: "Workspace apps open in their own window from now on. The tabs you already have open stay as they are, and the tab strip hides after you close them, or after a restart. Pinned apps set to load on launch open as windows the next time you start Meru.",
      openTabs:
        "Workspace apps open in their own window from now on. The tabs you already have open stay as they are, and the tab strip hides after you close them, or after a restart.",
      loadOnLaunch:
        "Workspace apps open in their own window from now on. Pinned apps set to load on launch open as windows the next time you start Meru.",
      other: "Workspace apps open in their own window from now on.",
    }),
    comment:
      "Dialog asking to confirm switching the Workspace apps Mode setting to New windows, which says more when Workspace app tabs are open, when pinned apps load on launch, or both",
  });

  const backgroundTabKey = platform.isMacOS
    ? t({
        message: "Cmd",
        comment:
          "Name of a keyboard key, as printed on keyboards in that language, e.g. German Windows keyboards print Strg for Ctrl",
      })
    : t({
        message: "Ctrl",
        comment:
          "Name of a keyboard key, as printed on keyboards in that language, e.g. German Windows keyboards print Strg for Ctrl",
      });

  // lingui-set comment="Name of a keyboard key, as printed on keyboards in that language, e.g. German Windows keyboards print Strg for Ctrl"
  const newWindowKey = byPlatform(platform, {
    macOS: t({ message: "Shift", context: "macOS" }),
    windows: t({ message: "Shift", context: "Windows" }),
    linux: t({ message: "Shift", context: "Linux" }),
  });
  // lingui-reset

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.workspaceApps)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t`Open in app`}
            description={t`Open Workspace apps in the app instead of the external browser.`}
            configKey="workspaceApps.openInApp"
            licenseKeyRequired
            restartRequired
          />
          {config["workspaceApps.openInApp"] && (
            <>
              <ConfigSelectField
                label={t({
                  message: "Mode",
                  comment:
                    "Setting for whether Workspace apps open as tabs or in windows of their own",
                })}
                description={
                  <Trans comment="Tabs and New windows quote this setting's options, so they match those options' wording">
                    How Workspace apps open. Tabs, the default, opens them in the main window. New
                    windows gives each one its own window with no tab strip. In Tabs, hold{" "}
                    <Kbd>{backgroundTabKey}</Kbd> to open a background tab or{" "}
                    <Kbd>{newWindowKey}</Kbd> to open a new window.
                  </Trans>
                }
                configKey="workspaceApps.mode"
                licenseKeyRequired
                items={Object.entries(workspaceAppsModes).map(([value, label]) => ({
                  value,
                  label: t(label),
                }))}
                confirmation={{
                  when: (mode) =>
                    mode === "windows" && (hasOpenWorkspaceAppTabs || hasLoadOnLaunchWorkspaceApps),
                  title: t({
                    message: "Switch to New windows?",
                    comment:
                      "New windows quotes the Mode setting's option, so it matches that option's wording",
                  }),
                  description: modeSwitchDescription,
                  confirmLabel: t({
                    message: "Switch to New windows",
                    comment:
                      "Button that confirms switching the Mode setting to its New windows option, matching that option's wording",
                  }),
                }}
              />
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor={excludedAppsFieldId} className="flex items-center gap-2">
                    <Trans comment="Setting that picks the Workspace apps that open in the external browser">
                      Excluded apps
                    </Trans>
                    <LicenseKeyRequiredFieldBadge />
                  </FieldLabel>
                  <FieldDescription>
                    <Trans>
                      Select the Workspace apps that open in the external browser instead of the
                      app.
                    </Trans>
                  </FieldDescription>
                </FieldContent>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    id={excludedAppsFieldId}
                    disabled={!isLicenseKeyValid}
                    render={
                      <Button variant="outline" className="justify-between font-normal">
                        {isLicenseKeyValid ? excludedAppsSummary : noExcludedAppsLabel}
                        <ChevronDownIcon className="opacity-50" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    {(Object.entries(workspaceApps) as Entries<typeof workspaceApps>)
                      .filter(([, { singleInstance }]) => !singleInstance)
                      .map(([app, { label }]) => (
                        <DropdownMenuCheckboxItem
                          key={app}
                          checked={config["workspaceApps.openInAppExcludedApps"].includes(app)}
                          closeOnClick={false}
                          onCheckedChange={(checked) => {
                            configMutation.mutate({
                              "workspaceApps.openInAppExcludedApps": checked
                                ? [...config["workspaceApps.openInAppExcludedApps"], app]
                                : config["workspaceApps.openInAppExcludedApps"].filter(
                                    (value) => value !== app,
                                  ),
                            });
                          }}
                        >
                          {label}
                        </DropdownMenuCheckboxItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Field>
            </>
          )}
          {config["workspaceApps.mode"] === "tabs" && (
            <>
              <FieldSeparator />
              <FieldSet>
                <FieldLegend>
                  <Trans comment="Heading of the settings for the vertical tabs sidebar">
                    Vertical tabs
                  </Trans>
                </FieldLegend>
                <ConfigSwitchField
                  label={t`Show windows`}
                  description={t`List Workspace apps that are open in their own window alongside the tabs, so the sidebar is an overview of everything open. Click one to bring its window forward.`}
                  configKey="verticalTabs.showWindows"
                  licenseKeyRequired
                />
                <ConfigSelectField
                  label={t({
                    message: "Width",
                    comment: "Setting for how wide the vertical tabs sidebar is",
                  })}
                  description={t({
                    message:
                      "How wide the vertical tabs sidebar is. Auto switches between narrow and wide based on the open tabs. The button at the bottom of the sidebar switches between narrow and wide for that account until Meru quits, leaving this setting as it is. Right-click the sidebar and choose Reset Width to hand it back.",
                    comment:
                      "Auto quotes this setting's option and Reset Width the sidebar's context menu item, so they match those messages' wording",
                  })}
                  configKey="verticalTabs.width"
                  licenseKeyRequired
                  items={Object.entries(verticalTabsWidths).map(([value, label]) => ({
                    value,
                    label: t(label),
                  }))}
                />
                <ConfigSwitchField
                  label={t`Show width button`}
                  description={t({
                    message:
                      "Show the button at the bottom of the sidebar that switches between narrow and wide. With this off, use Reset Width from the sidebar's context menu or the Width setting above.",
                    comment:
                      "Reset Width quotes the sidebar's context menu item and Width the setting above, so they match those messages' wording",
                  })}
                  configKey="verticalTabs.showWidthToggle"
                  licenseKeyRequired
                />
                <ConfigSelectField
                  label={t`Show Gmail unread badge`}
                  description={t({
                    message:
                      "Show the unread count on the Gmail tab. When another tab is active hides it while Gmail is in front, where the inbox already shows it. Accounts that need attention are still flagged whichever you pick.",
                    comment:
                      "When another tab is active quotes this setting's option, so it matches that option's wording",
                  })}
                  configKey="verticalTabs.gmailUnreadBadge"
                  licenseKeyRequired
                  items={Object.entries(verticalTabsGmailUnreadBadges).map(([value, label]) => ({
                    value,
                    label: t(label),
                  }))}
                />
                <ConfigSwitchField
                  label={t`Show app links badge`}
                  description={t`Mark the tab that opens all of an app's links, set from the tab's context menu. With this off, the tab still takes the links, and its tooltip still says so.`}
                  configKey="verticalTabs.showAppLinksBadge"
                  licenseKeyRequired
                />
              </FieldSet>
            </>
          )}
          <FieldSeparator />
          <ConfigSwitchField
            label={t`Persist zoom`}
            description={t`Remember the zoom level of Workspace apps across restarts. Each app keeps its own zoom level, shared by all its tabs and windows.`}
            configKey="workspaceApps.persistZoom"
            licenseKeyRequired
          />
          <FieldSeparator />
          <ConfigSelectField
            label={t`Hibernate idle tabs`}
            description={t({
              message:
                "Unload tabs that have been sitting unused, giving back the memory they hold. A hibernated tab keeps its place in the sidebar and loads again when you click it, on the page you left. Unpinned tabs leaves your pinned tabs loaded, and Selected tabs hibernates nothing until you mark a tab. Whichever you pick, a single tab can opt in or out with Hibernate When Idle in its context menu.",
              comment:
                "Unpinned tabs and Selected tabs quote this setting's options and Hibernate When Idle the tab's context menu item, so they match those messages' wording",
            })}
            configKey="workspaceApps.hibernation"
            licenseKeyRequired
            items={Object.entries(workspaceAppsHibernations).map(([value, label]) => ({
              value,
              label: t(label),
            }))}
          />
          <ConfigSelectField
            label={t`Hibernate after`}
            description={t`How long a tab has to go unused before it hibernates. The active tab, tabs in their own window, and tabs playing audio are left alone.`}
            configKey="workspaceApps.hibernationTimeout"
            licenseKeyRequired
            items={Object.entries(workspaceAppsHibernationTimeouts)
              .filter(
                ([value]) =>
                  import.meta.env.DEV || value !== DEV_WORKSPACE_APPS_HIBERNATION_TIMEOUT,
              )
              .map(([value, label]) => ({
                value,
                label: t(label),
              }))}
          />
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the settings for the Workspace apps launcher and the bookmarks button">
                Launcher and bookmarks
              </Trans>
            </FieldLegend>
            <Field>
              <FieldContent>
                <FieldTitle>
                  <Trans comment="Setting that picks the Workspace apps in the launcher">
                    Launcher apps
                  </Trans>
                  <LicenseKeyRequiredFieldBadge />
                </FieldTitle>
                <FieldDescription>
                  <Trans>Add Workspace apps to the launcher on the right of the titlebar.</Trans>
                </FieldDescription>
              </FieldContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    <Trans comment="Heading of the Workspace apps already in the launcher">
                      In launcher
                    </Trans>
                  </div>
                  {launcherApps.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                      <Trans comment="Available quotes the heading of the apps that can be added, so it matches that heading's wording">
                        No apps in the launcher yet. Add one from Available.
                      </Trans>
                    </p>
                  ) : (
                    <DragDropProvider
                      onDragEnd={(event) => {
                        if (event.canceled) {
                          return;
                        }

                        configMutation.mutate({
                          "workspaceApps.launcherApps": move(launcherApps, event),
                        });
                      }}
                    >
                      <div className="flex flex-row flex-wrap gap-2">
                        {launcherApps.map((app, index) => (
                          <SortableLauncherAppItem
                            key={app}
                            app={app}
                            index={index}
                            onRemove={() => {
                              configMutation.mutate({
                                "workspaceApps.launcherApps": launcherApps.filter(
                                  (value) => value !== app,
                                ),
                              });
                            }}
                            disabled={!isLicenseKeyValid}
                          />
                        ))}
                      </div>
                    </DragDropProvider>
                  )}
                </div>
                {availableApps.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      <Trans comment="Heading of the Workspace apps that can be added to the launcher">
                        Available
                      </Trans>
                    </div>
                    <div className="flex flex-row flex-wrap gap-2">
                      {availableApps.map((app) => {
                        const label = launcherWorkspaceApps[app];

                        return (
                          <Button
                            key={app}
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              configMutation.mutate({
                                "workspaceApps.launcherApps": [...launcherApps, app],
                              });
                            }}
                            disabled={!isLicenseKeyValid}
                            aria-label={t({
                              message: `Add ${label} to launcher`,
                              comment:
                                "Screen reader label of the button that puts a Workspace app in the launcher; label is the app's name",
                            })}
                          >
                            <WorkspaceAppIcon app={app} className="size-3.5" />
                            {label}
                            <PlusIcon />
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Field>
            <ConfigSelectField
              label={t`Launcher display`}
              description={t({
                message:
                  "How launcher apps are shown in the titlebar. Auto expands up to three apps into individual buttons and collapses beyond that. Collapsed always keeps them behind a single button, and Expanded always shows them as individual buttons.",
                comment:
                  "Auto, Collapsed and Expanded quote this setting's options, so they match those options' wording",
              })}
              configKey="workspaceApps.launcherDisplay"
              licenseKeyRequired
              items={Object.entries(workspaceAppsLauncherDisplays).map(([value, label]) => ({
                value,
                label: t(label),
              }))}
            />
            {config["workspaceApps.mode"] === "tabs" && (
              <ConfigSelectField
                label={t({
                  message: "Placement",
                  comment:
                    "Setting for where the Workspace apps launcher and the bookmarks button sit",
                })}
                description={t({
                  message:
                    "Where the launcher and the bookmarks button sit. Auto moves them to the bottom of the vertical tabs sidebar while it is shown. Sidebar keeps them there and holds the sidebar open even with a single tab, and Titlebar keeps them in the titlebar at all times.",
                  comment:
                    "Auto, Sidebar and Titlebar quote this setting's options, so they match those options' wording",
                })}
                configKey="workspaceApps.launcherAndBookmarksPlacement"
                licenseKeyRequired
                items={Object.entries(launcherAndBookmarksPlacements).map(([value, label]) => ({
                  value,
                  label: t(label),
                }))}
              />
            )}
            <ConfigSwitchField
              label={t`Show bookmarks button`}
              description={t`Show the button that opens bookmarks.`}
              configKey="workspaceApps.showBookmarksButton"
              licenseKeyRequired
            />
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
