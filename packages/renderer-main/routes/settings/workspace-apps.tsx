import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
import {
  type WorkspaceAppsPinnedApp,
  workspaceAppsPinnedApps,
  type SupportedWorkspaceApp,
  workspaceApps,
} from "@meru/shared/types";
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
  FieldSeparator,
} from "@meru/ui/components/field";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { ChevronDownIcon, GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";
import type { Entries } from "type-fest";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";

function SortablePinnedAppItem({
  app,
  index,
  onUnpin,
  disabled,
}: {
  app: WorkspaceAppsPinnedApp;
  index: number;
  onUnpin: () => void;
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
        aria-label={`Drag ${workspaceAppsPinnedApps[app]} to reorder`}
      >
        <GripVerticalIcon />
        <WorkspaceAppIcon app={app} className="size-3.5" />
        {workspaceAppsPinnedApps[app]}
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        onClick={onUnpin}
        disabled={disabled}
        aria-label={`Unpin ${workspaceAppsPinnedApps[app]}`}
      >
        <XIcon />
      </Button>
    </ButtonGroup>
  );
}

export function WorkspaceAppsSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config) {
    return;
  }

  const pinnedApps = config["workspaceApps.pinnedApps"];

  const availableApps = (Object.keys(workspaceAppsPinnedApps) as WorkspaceAppsPinnedApp[]).filter(
    (app) => !pinnedApps.includes(app),
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
        <SettingsTitle>Workspace Apps</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Open in App"
            description="Open Workspace Apps in app instead of external browser."
            configKey="workspaceApps.openInApp"
            licenseKeyRequired
          />
          {config["workspaceApps.openInApp"] && (
            <>
              <ConfigSwitchField
                label="Always Open in New Window"
                description="Always open Workspace Apps in a new window instead of reusing the same window if it is already open."
                configKey="workspaceApps.openAppsInNewWindow"
                licenseKeyRequired
              />
              <Field>
                <FieldContent>
                  <FieldLabel className="flex items-center gap-2">
                    Excluded Apps
                    {!isLicenseKeyValid && <LicenseKeyRequiredFieldBadge />}
                  </FieldLabel>
                  <FieldDescription>
                    Select which Workspace Apps should open in the external browser instead of the
                    app.
                  </FieldDescription>
                </FieldContent>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={!isLicenseKeyValid}
                    render={
                      <Button variant="outline" className="justify-between font-normal">
                        {isLicenseKeyValid ? excludedAppsSummary : "None"}
                        <ChevronDownIcon className="opacity-50" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    {(Object.entries(workspaceApps) as Entries<typeof workspaceApps>).map(
                      ([app, { label }]) => (
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
                      ),
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Field>
            </>
          )}
          <FieldSeparator />
          <ConfigSwitchField
            label="Show Account Label"
            description="Show the account label in the titlebar of Workspace Apps windows if using more than one account."
            configKey="workspaceApps.showAccountLabel"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Show Account Color"
            description="Show a colored indicator on top of Workspace Apps windows to indicate which account is being used when an account has a color configured."
            configKey="workspaceApps.showAccountColor"
            licenseKeyRequired
          />
          <FieldSeparator />
          <Field>
            <FieldContent>
              <FieldLabel className="flex items-center gap-2">
                Pinned Apps
                {!isLicenseKeyValid && <LicenseKeyRequiredFieldBadge />}
              </FieldLabel>
              <FieldDescription>
                Pin Workspace Apps to the titlebar and drag to reorder.
              </FieldDescription>
            </FieldContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">Pinned</div>
                {pinnedApps.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                    No pinned apps. Add apps from Available below.
                  </p>
                ) : (
                  <DragDropProvider
                    onDragEnd={(event) => {
                      if (event.canceled) {
                        return;
                      }

                      configMutation.mutate({
                        "workspaceApps.pinnedApps": move(pinnedApps, event),
                      });
                    }}
                  >
                    <div className="flex flex-row flex-wrap gap-2">
                      {pinnedApps.map((app, index) => (
                        <SortablePinnedAppItem
                          key={app}
                          app={app}
                          index={index}
                          onUnpin={() => {
                            configMutation.mutate({
                              "workspaceApps.pinnedApps": pinnedApps.filter(
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
                            "workspaceApps.pinnedApps": [...pinnedApps, app],
                          });
                        }}
                        disabled={!isLicenseKeyValid}
                        aria-label={`Pin ${workspaceAppsPinnedApps[app]}`}
                      >
                        <WorkspaceAppIcon app={app} className="size-3.5" />
                        {workspaceAppsPinnedApps[app]}
                        <PlusIcon />
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Field>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
