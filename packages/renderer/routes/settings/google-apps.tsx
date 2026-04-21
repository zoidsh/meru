import { closestCenter, DndContext, PointerSensor, useSensor } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@meru/i18n/provider";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import {
  type GoogleAppsPinnedApp,
  googleAppsPinnedApps,
  type SupportedGoogleApp,
  supportedGoogleApps,
} from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
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
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@meru/ui/components/item";
import { ChevronDownIcon, GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";
import type { Entries } from "type-fest";
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
  const { t } = useTranslation();

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
        aria-label={t("settings.googleApps.dragToReorder", { app: googleAppsPinnedApps[app] })}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon />
      </Button>
      <ItemContent>
        <ItemTitle>
          <GoogleAppIcon app={app} className="size-3.5" />
          {googleAppsPinnedApps[app]}
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onUnpin}
          disabled={disabled}
          aria-label={t("settings.googleApps.unpin", { app: googleAppsPinnedApps[app] })}
        >
          <XIcon />
        </Button>
      </ItemActions>
    </Item>
  );
}

export function GoogleAppsSettings() {
  const { t } = useTranslation();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const pointerSensor = useSensor(PointerSensor);

  if (!config) {
    return;
  }

  const pinnedApps = config["googleApps.pinnedApps"];

  const availableApps = (Object.keys(googleAppsPinnedApps) as GoogleAppsPinnedApp[]).filter(
    (app) => !pinnedApps.includes(app),
  );

  const excludedApps = config["googleApps.openInAppExcludedApps"];

  const excludedAppLabels = (Object.keys(supportedGoogleApps) as SupportedGoogleApp[])
    .filter((app) => excludedApps.includes(app))
    .map((app) => supportedGoogleApps[app]);

  const visibleExcludedAppLabels = excludedAppLabels.slice(0, 3);

  const remainingExcludedAppCount = excludedAppLabels.length - visibleExcludedAppLabels.length;

  const excludedAppsSummary =
    excludedAppLabels.length === 0
      ? t("settings.googleApps.none")
      : remainingExcludedAppCount > 0
        ? t("settings.googleApps.excludedSummary", {
            list: visibleExcludedAppLabels.join(", "),
            count: remainingExcludedAppCount,
          })
        : visibleExcludedAppLabels.join(", ");

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t("settings.googleApps.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label={t("settings.googleApps.openInApp")}
            description={t("settings.googleApps.openInAppDescription")}
            configKey="googleApps.openInApp"
            licenseKeyRequired
          />
          {config["googleApps.openInApp"] && (
            <>
              <ConfigSwitchField
                label={t("settings.googleApps.openInNewWindow")}
                description={t("settings.googleApps.openInNewWindowDescription")}
                configKey="googleApps.openAppsInNewWindow"
                licenseKeyRequired
              />
              <Field>
                <FieldContent>
                  <FieldLabel className="flex items-center gap-2">
                    {t("settings.googleApps.excludedApps")}
                    {!isLicenseKeyValid && <LicenseKeyRequiredFieldBadge />}
                  </FieldLabel>
                  <FieldDescription>
                    {t("settings.googleApps.excludedAppsDescription")}
                  </FieldDescription>
                </FieldContent>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={!isLicenseKeyValid}
                    render={
                      <Button variant="outline" className="justify-between font-normal">
                        {isLicenseKeyValid ? excludedAppsSummary : t("settings.googleApps.none")}
                        <ChevronDownIcon className="opacity-50" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    {(
                      Object.entries(supportedGoogleApps) as Entries<typeof supportedGoogleApps>
                    ).map(([app, label]) => (
                      <DropdownMenuCheckboxItem
                        key={app}
                        checked={config["googleApps.openInAppExcludedApps"].includes(app)}
                        closeOnClick={false}
                        onCheckedChange={(checked) => {
                          configMutation.mutate({
                            "googleApps.openInAppExcludedApps": checked
                              ? [...config["googleApps.openInAppExcludedApps"], app]
                              : config["googleApps.openInAppExcludedApps"].filter(
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
          <FieldSeparator />
          <ConfigSwitchField
            label={t("settings.googleApps.showAccountLabel")}
            description={t("settings.googleApps.showAccountLabelDescription")}
            configKey="googleApps.showAccountLabel"
            licenseKeyRequired
          />
          <ConfigSwitchField
            label={t("settings.googleApps.showAccountColor")}
            description={t("settings.googleApps.showAccountColorDescription")}
            configKey="googleApps.showAccountColor"
            licenseKeyRequired
          />
          <FieldSeparator />
          <Field>
            <FieldContent>
              <FieldLabel className="flex items-center gap-2">
                {t("settings.googleApps.pinnedApps")}
                {!isLicenseKeyValid && <LicenseKeyRequiredFieldBadge />}
              </FieldLabel>
              <FieldDescription>{t("settings.googleApps.pinnedAppsDescription")}</FieldDescription>
            </FieldContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("settings.googleApps.pinned")}
                </div>
                {pinnedApps.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                    {t("settings.googleApps.noPinnedApps")}
                  </p>
                ) : (
                  <DndContext
                    sensors={[pointerSensor]}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      const { active, over } = event;

                      if (!over || active.id === over.id) {
                        return;
                      }

                      const oldIndex = pinnedApps.indexOf(active.id as GoogleAppsPinnedApp);
                      const newIndex = pinnedApps.indexOf(over.id as GoogleAppsPinnedApp);

                      configMutation.mutate({
                        "googleApps.pinnedApps": arrayMove(pinnedApps, oldIndex, newIndex),
                      });
                    }}
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
                  <div className="text-xs font-medium text-muted-foreground">
                    {t("settings.googleApps.available")}
                  </div>
                  <ItemGroup className="grid grid-cols-2">
                    {availableApps.map((app) => (
                      <Item key={app} variant="outline" size="xs">
                        <ItemContent>
                          <ItemTitle>
                            <GoogleAppIcon app={app} className="size-3.5" />
                            {googleAppsPinnedApps[app]}
                          </ItemTitle>
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
                            aria-label={t("settings.googleApps.pin", {
                              app: googleAppsPinnedApps[app],
                            })}
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
