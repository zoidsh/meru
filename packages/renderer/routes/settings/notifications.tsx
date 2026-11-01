import { msg, select } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ipc } from "@meru/shared/renderer/ipc";
import { minutesToTime, timeToMinutes } from "@meru/shared/time";
import type { NotificationTime } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import { Item, ItemActions, ItemContent } from "@meru/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { Slider } from "@meru/ui/components/slider";
import { Plus, X } from "lucide-react";
import { useId, useMemo } from "react";
import { toast } from "sonner";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { LicenseKeyRequiredFieldBadge } from "@/components/license-key-required-field-badge";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { NOTIFICATION_SOUNDS, playNotificationSound } from "@/lib/notifications";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { platform } from "@/lib/utils";

const newEmailsItems = [
  {
    value: "all",
    label: msg({
      message: "All new emails",
      comment: "Option of the Notify for setting: a notification for every new email",
    }),
  },
  {
    value: "important",
    label: msg({
      message: "Important only",
      comment:
        "Option of the Notify for setting: a notification only for the emails Gmail marks as important. Important is Gmail's word for them, so it follows Gmail's word in this language",
    }),
  },
];

const FIRST_TIME_WINDOW = { start: "09:00", end: "17:00" };

const MONDAY_FIRST_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

function hasOverlap(times: NotificationTime[]) {
  return times.some((timeA, index) =>
    times.slice(index + 1).some((timeB) => {
      const aStart = timeToMinutes(timeA.start);
      const aEnd = timeToMinutes(timeA.end);
      const bStart = timeToMinutes(timeB.start);
      const bEnd = timeToMinutes(timeB.end);

      return aStart < bEnd && bStart < aEnd;
    }),
  );
}

function findFreeSlot(existingTimes: NotificationTime[]) {
  if (existingTimes.length === 0) {
    return FIRST_TIME_WINDOW;
  }

  for (let hour = 0; hour < 24; hour++) {
    const startMinutes = hour * 60;
    const endMinutes = startMinutes + 60;

    if (endMinutes > 24 * 60) {
      break;
    }

    const start = minutesToTime(startMinutes);
    const end = minutesToTime(endMinutes);
    const candidate: NotificationTime = { id: "", start, end };

    if (!hasOverlap([...existingTimes, candidate])) {
      return { start, end };
    }
  }

  return null;
}

export function NotificationsSettings() {
  const { config } = useConfig();

  const soundFieldId = useId();

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const { i18n, t } = useLingui();

  const weekdayFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.locale, { weekday: "short", timeZone: "UTC" }),
    [i18n.locale],
  );

  const percentFormat = useMemo(
    () => new Intl.NumberFormat(i18n.locale, { style: "percent", maximumFractionDigits: 0 }),
    [i18n.locale],
  );

  if (!config) {
    return;
  }

  const times = config["notifications.times"];

  const percent = percentFormat.format(config["notifications.volume"]);

  const downloadNotificationAction = platform.isLinux ? "click" : "button";

  // 4 January 1970 was a Sunday, so day 4 + n is weekday n.
  const getWeekdayLabel = (dayIndex: number) =>
    weekdayFormat.format(Date.UTC(1970, 0, 4 + dayIndex));

  const addTime = () => {
    const slot = findFreeSlot(times);

    if (!slot) {
      toast.error(t`No free time slot left for another window. Remove or shorten one first.`);

      return;
    }

    const newEntry: NotificationTime = { id: crypto.randomUUID(), ...slot };

    configMutation.mutate({ "notifications.times": [...times, newEntry] });
  };

  const updateTime = (id: string, field: "start" | "end", value: string) => {
    const newTimes = times.map((time) => (time.id === id ? { ...time, [field]: value } : time));

    if (hasOverlap(newTimes)) {
      toast.error(t`Notification times overlap. Adjust the windows so that none of them do.`);

      return;
    }

    configMutation.mutate({ "notifications.times": newTimes });
  };

  const updateTimeDays = (id: string, dayIndex: number) => {
    const newTimes = times.map((time) => {
      if (time.id !== id) {
        return time;
      }

      const currentDays = time.days ?? [];
      const days = currentDays.includes(dayIndex)
        ? currentDays.filter((day) => day !== dayIndex)
        : [...currentDays, dayIndex];

      return { ...time, days };
    });

    configMutation.mutate({ "notifications.times": newTimes });
  };

  const removeTime = (id: string) => {
    configMutation.mutate({
      "notifications.times": times.filter((time) => time.id !== id),
    });
  };

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.notifications)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Notifications section about notifications for new emails">
                Emails
              </Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t({
                  message: "New emails",
                  comment: "Setting that turns on notifications for new emails",
                })}
                description={t`Show notifications for new emails.`}
                configKey="notifications.enabled"
              />
              {config["notifications.enabled"] && (
                <>
                  <ConfigSelectField
                    configKey="notifications.newEmails"
                    label={t({
                      message: "Notify for",
                      comment: "Setting that picks which new emails show a notification",
                    })}
                    description={t({
                      message:
                        "Choose whether every new email or only the emails Gmail marks as important shows a notification.",
                      comment:
                        "Marks as important names Gmail's Important marker, so important follows Gmail's word for it",
                    })}
                    items={newEmailsItems.map(({ value, label }) => ({ value, label: t(label) }))}
                    licenseKeyRequired
                  />
                  <ConfigSwitchField
                    label={t`Show sender`}
                    description={t`Display the email sender's name in notifications.`}
                    configKey="notifications.showSender"
                  />
                  <ConfigSwitchField
                    label={t`Show subject`}
                    description={t`Display the email subject in notifications.`}
                    configKey="notifications.showSubject"
                  />
                  <ConfigSwitchField
                    label={t`Show summary`}
                    description={t`Display the email summary in notifications.`}
                    configKey="notifications.showSummary"
                  />
                  <Field>
                    <FieldTitle>
                      <Trans>Notification times</Trans>
                      <LicenseKeyRequiredFieldBadge />
                    </FieldTitle>
                    <FieldDescription>
                      <Trans>
                        Set the time windows when notifications are active. Outside them,
                        notifications stay silent. Leave the list empty to allow notifications at
                        any time.
                      </Trans>
                    </FieldDescription>
                    {times.map((time) => (
                      <Item key={time.id} variant="muted">
                        <ItemContent className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={time.start}
                              onChange={(event) => updateTime(time.id, "start", event.target.value)}
                              className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                              disabled={!isLicenseKeyValid}
                            />
                            <span className="shrink-0 text-sm text-muted-foreground">
                              <Trans comment="Sits between a start time field and an end time field, as in 09:00 to 17:00">
                                to
                              </Trans>
                            </span>
                            <Input
                              type="time"
                              value={time.end}
                              onChange={(event) => updateTime(time.id, "end", event.target.value)}
                              className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                              disabled={!isLicenseKeyValid}
                            />
                          </div>
                          <div className="flex gap-2">
                            {MONDAY_FIRST_WEEKDAYS.map((dayIndex) => {
                              const isActive = (time.days ?? []).includes(dayIndex);

                              return (
                                <Button
                                  key={dayIndex}
                                  variant={isActive ? "default" : "outline"}
                                  size="sm"
                                  className="w-9 px-0"
                                  onClick={() => updateTimeDays(time.id, dayIndex)}
                                  disabled={!isLicenseKeyValid}
                                >
                                  {getWeekdayLabel(dayIndex)}
                                </Button>
                              );
                            })}
                          </div>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTime(time.id)}
                            disabled={!isLicenseKeyValid}
                            title={t`Remove time window`}
                          >
                            <X />
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                    <div>
                      <Button variant="outline" onClick={addTime} disabled={!isLicenseKeyValid}>
                        <Plus /> <Trans>Add time window</Trans>
                      </Button>
                    </div>
                  </Field>
                  <Field>
                    <FieldTitle>
                      <Trans>Test notification</Trans>
                    </FieldTitle>
                    <FieldDescription>
                      <Trans>Show a test notification to see how notifications appear.</Trans>
                    </FieldDescription>
                    <div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (config["doNotDisturb.enabled"]) {
                            toast.error(t`Turn off Do Not Disturb to show a test notification.`);

                            return;
                          }

                          ipc.main.send("notifications.showTestNotification");
                        }}
                      >
                        <Trans>Show test notification</Trans>
                      </Button>
                    </div>
                  </Field>
                </>
              )}
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Notifications section about notifications for finished downloads">
                Downloads
              </Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t({
                  message: "Show notification",
                  comment: "Setting that shows a notification when a download finishes",
                })}
                description={t`Show a notification when a download finishes.`}
                configKey="notifications.downloadCompleted"
              />
              {config["notifications.downloadCompleted"] && (
                <ConfigSelectField
                  label={t({
                    message: select(downloadNotificationAction, {
                      click: "On click",
                      other: "Button",
                    }),
                    comment:
                      "Setting that picks what a finished download's notification does: on Linux, clicking it; elsewhere, its button",
                  })}
                  description={t({
                    message: select(downloadNotificationAction, {
                      click: "Choose what clicking the notification does.",
                      other: "Choose what the notification's button does.",
                    }),
                    comment:
                      "On Linux, a finished download's notification acts when clicked; elsewhere, through its button",
                  })}
                  configKey="notifications.onClickDownloadCompleted"
                  items={[
                    {
                      value: "showInFolder",
                      label: t({
                        message: "Show in folder",
                        context: "download action",
                        comment: "Option of what a finished download's notification does",
                      }),
                    },
                    {
                      value: "openFile",
                      label: t({
                        message: "Open file",
                        comment: "Option of what a finished download's notification does",
                      }),
                    },
                  ]}
                />
              )}
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Notifications section about notifications from Workspace apps">
                Workspace apps
              </Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t({
                  message: "Show notifications",
                  comment: "Setting that lets Workspace apps show notifications",
                })}
                description={t`Show notifications from Workspace apps such as Calendar, Meet, and Chat.`}
                configKey="notifications.allowFromWorkspaceApps"
                licenseKeyRequired
              />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Notifications section about notification sounds">
                Sound
              </Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t`Play sound`}
                description={t`Play a sound when showing a notification.`}
                configKey="notifications.playSound"
              />
              {config["notifications.playSound"] && (
                <>
                  <Field>
                    <FieldLabel htmlFor={soundFieldId} className="flex items-center gap-2">
                      <Trans comment="Setting that picks the notification sound">Sound</Trans>
                      <LicenseKeyRequiredFieldBadge />
                    </FieldLabel>
                    <FieldDescription>
                      <Trans>Select the sound to play for notifications.</Trans>
                    </FieldDescription>
                    <Select
                      items={Object.entries(NOTIFICATION_SOUNDS).map(([sound, { label }]) => ({
                        value: sound,
                        label: t(label),
                      }))}
                      value={config["notifications.sound"]}
                      onValueChange={(value) => {
                        if (value) {
                          configMutation.mutate({
                            "notifications.sound": value,
                          });

                          if (value !== "system") {
                            playNotificationSound({
                              sound: value,
                              volume: config["notifications.volume"],
                            });
                          }
                        }
                      }}
                      disabled={!isLicenseKeyValid}
                    >
                      <SelectTrigger id={soundFieldId}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(NOTIFICATION_SOUNDS).map(([sound, { label }]) => (
                          <SelectItem key={sound} value={sound}>
                            {t(label)}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="system">
                          <Trans comment="Option of the Sound setting: the operating system's own notification sound">
                            System
                          </Trans>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {config["notifications.sound"] !== "system" && (
                    <Field>
                      <FieldTitle>
                        <Trans comment="Title of the notification sound's volume slider; percent is the volume, such as 50%">
                          Volume {percent}
                        </Trans>
                      </FieldTitle>
                      <FieldDescription>
                        <Trans>Set the volume level for notification sounds.</Trans>
                      </FieldDescription>
                      <Slider
                        className="my-2"
                        // A sound that plays at no volume is a sound setting
                        // that looks on and is silent. Silence is turning
                        // sounds off instead.
                        min={5}
                        step={5}
                        value={[config["notifications.volume"] * 100]}
                        onValueChange={(value) => {
                          if (typeof value !== "number") {
                            return;
                          }

                          configMutation.mutate({
                            "notifications.volume": value / 100,
                          });
                        }}
                        onValueCommitted={(value) => {
                          if (typeof value !== "number") {
                            return;
                          }

                          const volume = value / 100;

                          if (config["notifications.sound"] !== "system") {
                            playNotificationSound({
                              sound: config["notifications.sound"],
                              volume,
                            });
                          }
                        }}
                      />
                    </Field>
                  )}
                </>
              )}
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
