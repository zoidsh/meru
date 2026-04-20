import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import { type GoogleAppsPinnedApp, googleAppsPinnedApps } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@meru/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@meru/ui/components/item";
import { GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { GoogleAppIcon } from "@/components/google-app-icon";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";

function SortablePinnedAppItem({
  app,
  onUnpin,
  disabled,
}: {
  app: GoogleAppsPinnedApp;
  onUnpin: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <Item ref={setNodeRef} style={style} variant="outline" size="xs">
      <Button
        size="icon-xs"
        variant="ghost"
        className="cursor-grab touch-none"
        disabled={disabled}
        aria-label={`Drag ${googleAppsPinnedApps[app]} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon />
      </Button>
      <ItemMedia variant="icon">
        <GoogleAppIcon app={app} className="size-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{googleAppsPinnedApps[app]}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onUnpin}
          disabled={disabled}
          aria-label={`Unpin ${googleAppsPinnedApps[app]}`}
        >
          <XIcon />
        </Button>
      </ItemActions>
    </Item>
  );
}

export function GoogleAppsSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const sensors = useSensors(useSensor(PointerSensor));

  if (!config) {
    return;
  }

  const pinnedApps = config["googleApps.pinnedApps"];

  const availableApps = (Object.keys(googleAppsPinnedApps) as GoogleAppsPinnedApp[]).filter(
    (app) => !pinnedApps.includes(app),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = pinnedApps.indexOf(active.id as GoogleAppsPinnedApp);
    const newIndex = pinnedApps.indexOf(over.id as GoogleAppsPinnedApp);

    configMutation.mutate({
      "googleApps.pinnedApps": arrayMove(pinnedApps, oldIndex, newIndex),
    });
  };

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Google Apps</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Open in App"
            description="Open Google Apps in app instead of external browser."
            configKey="googleApps.openInApp"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Open Google Apps in New Window"
            description="Open Google Apps in a new window instead of reusing the same window if it is already open."
            configKey="googleApps.openAppsInNewWindow"
            licenseKeyRequired
          />
          <FieldSeparator />
          <ConfigSwitchField
            label="Show Account Label"
            description="Show the account label in the titlebar of Google Apps windows if using more than one account."
            configKey="googleApps.showAccountLabel"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label="Show Account Color"
            description="Show a colored indicator on top of Google Apps windows to indicate which account is being used when an account has a color configured."
            configKey="googleApps.showAccountColor"
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
                Pin Google Apps to the titlebar and drag to reorder.
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
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={pinnedApps} strategy={verticalListSortingStrategy}>
                      <ItemGroup>
                        {pinnedApps.map((app) => (
                          <SortablePinnedAppItem
                            key={app}
                            app={app}
                            onUnpin={() => {
                              configMutation.mutate({
                                "googleApps.pinnedApps": pinnedApps.filter(
                                  (value) => value !== app,
                                ),
                              });
                            }}
                            disabled={!isLicenseKeyValid}
                          />
                        ))}
                      </ItemGroup>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
              {availableApps.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-muted-foreground">Available</div>
                  <ItemGroup>
                    {availableApps.map((app) => (
                      <Item key={app} variant="outline" size="xs">
                        <ItemMedia variant="icon">
                          <GoogleAppIcon app={app} className="size-3" />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>{googleAppsPinnedApps[app]}</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => {
                              configMutation.mutate({
                                "googleApps.pinnedApps": [...pinnedApps, app],
                              });
                            }}
                            disabled={!isLicenseKeyValid}
                            aria-label={`Pin ${googleAppsPinnedApps[app]}`}
                          >
                            <PlusIcon />
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                </div>
              )}
            </div>
          </Field>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
