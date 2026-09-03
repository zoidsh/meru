import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GMAIL_TAB_ID, verticalTabsWidths } from "@meru/shared/tabs";
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
import { useId } from "react";
import type { Entries } from "type-fest";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { WorkspaceAppIcon } from "@/components/workspace-app-icon";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";
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

  return (
    <ButtonGroup ref={ref} className={isDragging ? "opacity-50" : undefined}>
      <Button
        ref={handleRef}
        variant="outline"
        size="xs"
        className="cursor-grab touch-none"
        disabled={disabled}
        aria-label={`Drag ${launcherWorkspaceApps[app]} to reorder`}
      >
        <GripVerticalIcon />
        <WorkspaceAppIcon app={app} className="size-3.5" />
        {launcherWorkspaceApps[app]}
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${launcherWorkspaceApps[app]} from launcher`}
      >
        <XIcon />
      </Button>
    </ButtonGroup>
  );
}

export function WorkspaceAppsSettings() {
  const { config } = useConfig();

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

  const excludedAppsSummary =
    excludedAppLabels.length === 0
      ? "None"
      : remainingExcludedAppCount > 0
        ? `${visibleExcludedAppLabels.join(", ")} +${remainingExcludedAppCount} excluded`
        : visibleExcludedAppLabels.join(", ");

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Workspace apps</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Open in app"
            description="Open Workspace apps in the app instead of the external browser."
            configKey="workspaceApps.openInApp"
            licenseKeyRequired
            restartRequired
          />
          {config["workspaceApps.openInApp"] && (
            <>
              <ConfigSelectField
                label="Mode"
                description={
                  <>
                    How Workspace apps open. Tabs, the default, opens them in the main window. New
                    windows gives each one its own window with no tab strip. In Tabs, hold{" "}
                    <Kbd>{platform.isMacOS ? "Cmd" : "Ctrl"}</Kbd> to open a background tab or{" "}
                    <Kbd>Shift</Kbd> to open a new window.
                  </>
                }
                configKey="workspaceApps.mode"
                licenseKeyRequired
                items={Object.entries(workspaceAppsModes).map(([value, label]) => ({
                  value,
                  label,
                }))}
                confirmation={{
                  when: (mode) =>
                    mode === "windows" && (hasOpenWorkspaceAppTabs || hasLoadOnLaunchWorkspaceApps),
                  title: "Switch to New windows?",
                  description: (
                    <>
                      Workspace apps open in their own window from now on.
                      {hasOpenWorkspaceAppTabs &&
                        " The tabs you already have open stay as they are, and the tab strip hides after you close them, or after a restart."}
                      {hasLoadOnLaunchWorkspaceApps &&
                        " Pinned apps set to load on launch open as windows the next time you start Meru."}
                    </>
                  ),
                  confirmLabel: "Switch to New windows",
                }}
              />
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor={excludedAppsFieldId} className="flex items-center gap-2">
                    Excluded apps
                    <LicenseKeyRequiredFieldBadge />
                  </FieldLabel>
                  <FieldDescription>
                    Select the Workspace apps that open in the external browser instead of the app.
                  </FieldDescription>
                </FieldContent>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    id={excludedAppsFieldId}
                    disabled={!isLicenseKeyValid}
                    render={
                      <Button variant="outline" className="justify-between font-normal">
                        {isLicenseKeyValid ? excludedAppsSummary : "None"}
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
                <FieldLegend>Vertical tabs</FieldLegend>
                <ConfigSwitchField
                  label="Show windows"
                  description="List Workspace apps that are open in their own window alongside the tabs, so the sidebar is an overview of everything open. Click one to bring its window forward."
                  configKey="verticalTabs.showWindows"
                  licenseKeyRequired
                />
                <ConfigSelectField
                  label="Width"
                  description="How wide the vertical tabs sidebar is. Auto switches between narrow and wide based on the open tabs. The button at the bottom of the sidebar switches between narrow and wide for that account until Meru quits, leaving this setting as it is. Right-click the sidebar and choose Reset Width to hand it back."
                  configKey="verticalTabs.width"
                  licenseKeyRequired
                  items={Object.entries(verticalTabsWidths).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                <ConfigSwitchField
                  label="Show width button"
                  description="Show the button at the bottom of the sidebar that switches between narrow and wide. With this off, use Reset Width from the sidebar's context menu or the Width setting above."
                  configKey="verticalTabs.showWidthToggle"
                  licenseKeyRequired
                />
                <ConfigSwitchField
                  label="Hide Gmail unread badge when active"
                  description="Hide the unread badge on the Gmail tab while it is the active tab, because the inbox is already in front. Accounts that need attention are still flagged."
                  configKey="verticalTabs.hideUnreadBadgeWhenActive"
                  licenseKeyRequired
                />
                <ConfigSwitchField
                  label="Show app links badge"
                  description="Mark the tab that opens all of an app's links, set from the tab's context menu. With this off, the tab still takes the links, and its tooltip still says so."
                  configKey="verticalTabs.showAppLinksBadge"
                  licenseKeyRequired
                />
              </FieldSet>
            </>
          )}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Windows</FieldLegend>
            <ConfigSwitchField
              label="Show account label"
              description="Show the account label in the titlebar of Workspace apps windows, with more than one account."
              configKey="workspaceApps.showAccountLabel"
              licenseKeyRequired
            />
            <ConfigSwitchField
              label="Show account color"
              description="Show a colored indicator on top of a Workspace apps window, naming the account in use. It appears only for accounts that have a color."
              configKey="workspaceApps.showAccountColor"
              licenseKeyRequired
            />
          </FieldSet>
          <FieldSeparator />
          <ConfigSwitchField
            label="Persist zoom"
            description="Remember the zoom level of Workspace apps across restarts. Each app keeps its own zoom level, shared by all its tabs and windows."
            configKey="workspaceApps.persistZoom"
            licenseKeyRequired
          />
          <FieldSeparator />
          <ConfigSelectField
            label="Hibernate idle tabs"
            description="Unload tabs that have been sitting unused, giving back the memory they hold. A hibernated tab keeps its place in the sidebar and loads again when you click it, on the page you left. Selected tabs only hibernates the tabs you mark with Hibernate When Idle in the tab's context menu."
            configKey="workspaceApps.hibernation"
            licenseKeyRequired
            items={Object.entries(workspaceAppsHibernations).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <ConfigSelectField
            label="Hibernate after"
            description="How long a tab has to go unused before it hibernates. The active tab, tabs in their own window, and tabs playing audio are left alone."
            configKey="workspaceApps.hibernationTimeout"
            licenseKeyRequired
            items={Object.entries(workspaceAppsHibernationTimeouts)
              .filter(
                ([value]) =>
                  import.meta.env.DEV || value !== DEV_WORKSPACE_APPS_HIBERNATION_TIMEOUT,
              )
              .map(([value, label]) => ({
                value,
                label,
              }))}
          />
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Launcher and bookmarks</FieldLegend>
            <Field>
              <FieldContent>
                <FieldTitle>
                  Launcher apps
                  <LicenseKeyRequiredFieldBadge />
                </FieldTitle>
                <FieldDescription>
                  Add Workspace apps to the launcher on the right of the titlebar.
                </FieldDescription>
              </FieldContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-muted-foreground">In launcher</div>
                  {launcherApps.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                      No apps in the launcher yet. Add one from Available.
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
                    <div className="text-xs font-medium text-muted-foreground">Available</div>
                    <div className="flex flex-row flex-wrap gap-2">
                      {availableApps.map((app) => (
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
                          aria-label={`Add ${launcherWorkspaceApps[app]} to launcher`}
                        >
                          <WorkspaceAppIcon app={app} className="size-3.5" />
                          {launcherWorkspaceApps[app]}
                          <PlusIcon />
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Field>
            <ConfigSelectField
              label="Launcher display"
              description="How launcher apps are shown in the titlebar. Auto expands up to three apps into individual buttons and collapses beyond that. Collapsed always keeps them behind a single button, and Expanded always shows them as individual buttons."
              configKey="workspaceApps.launcherDisplay"
              licenseKeyRequired
              items={Object.entries(workspaceAppsLauncherDisplays).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            {config["workspaceApps.mode"] === "tabs" && (
              <ConfigSelectField
                label="Placement"
                description="Where the launcher and the bookmarks button sit. Auto moves them to the bottom of the vertical tabs sidebar while it is shown. Sidebar keeps them there and holds the sidebar open even with a single tab, and Titlebar keeps them in the titlebar at all times."
                configKey="workspaceApps.launcherAndBookmarksPlacement"
                licenseKeyRequired
                items={Object.entries(launcherAndBookmarksPlacements).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            )}
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
