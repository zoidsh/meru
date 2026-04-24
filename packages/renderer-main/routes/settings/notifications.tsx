import { ipc } from "@meru/shared/renderer/ipc";
import { platform } from "@meru/shared/renderer/utils";
import { Badge } from "@meru/ui/components/badge";
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
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { NOTIFICATION_SOUNDS, playNotificationSound } from "@/lib/notifications";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
import { minutesToTime, timeToMinutes } from "@meru/shared/time";
import type { NotificationTime } from "@meru/shared/types";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

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
    return { start: "09:00", end: "17:00" };
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

  const configMutation = useConfigMutation();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  if (!config) {
    return;
  }

  const times = config["notifications.times"];

  const addTime = () => {
    const slot = findFreeSlot(times);

    if (!slot) {
      toast.error("No free time slot available to add a new window.");

      return;
    }

    const newEntry: NotificationTime = { id: crypto.randomUUID(), ...slot };

    configMutation.mutate({ "notifications.times": [...times, newEntry] });
  };

  const updateTime = (id: string, field: "start" | "end", value: string) => {
    const newTimes = times.map((time) => (time.id === id ? { ...time, [field]: value } : time));

    if (hasOverlap(newTimes)) {
      toast.error("Notification times overlap. Please adjust the time windows.");

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
        <SettingsTitle>Notifications</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Emails</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="New Emails"
                description="Show notifications for new emails."
                configKey="notifications.enabled"
              />
              {config["notifications.enabled"] && (
                <>
                  <ConfigSwitchField
                    label="Show Sender"
                    description="Display the email sender's name in notifications."
                    configKey="notifications.showSender"
                  />
                  <ConfigSwitchField
                    label="Show Subject"
                    description="Display the email subject in notifications."
                    configKey="notifications.showSubject"
                  />
                  {platform.isMacOS && (
                    <ConfigSwitchField
                      label="Show Summary"
                      description="Display the email summary in notifications."
                      configKey="notifications.showSummary"
                    />
                  )}
                  <Field>
                    <FieldLabel className="flex items-center gap-2">
                      Notification Times
                      {!isLicenseKeyValid && <Badge variant="secondary">Meru Pro Required</Badge>}
                    </FieldLabel>
                    <FieldDescription>
                      Configure time windows when notifications are active. Outside these windows,
                      notifications will be silenced. Leave empty to always allow notifications.
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
                            <span className="text-muted-foreground shrink-0 text-sm">to</span>
                            <Input
                              type="time"
                              value={time.end}
                              onChange={(event) => updateTime(time.id, "end", event.target.value)}
                              className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                              disabled={!isLicenseKeyValid}
                            />
                          </div>
                          <div className="flex gap-2">
                            {([1, 2, 3, 4, 5, 6, 0] as const).map((dayIndex, position) => {
                              const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
                                  {dayLabels[position]}
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
                          >
                            <X />
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                    <div>
                      <Button variant="outline" onClick={addTime} disabled={!isLicenseKeyValid}>
                        <Plus /> Add Time Window
                      </Button>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Test Notification</FieldLabel>
                    <FieldDescription>
                      Show a test notification to see how notifications will appear.
                    </FieldDescription>
                    <div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (config["doNotDisturb.enabled"]) {
                            toast.error(
                              "Unable show test notification while Do Not Disturb is enabled.",
                            );

                            return;
                          }

                          ipc.main.send("notifications.showTestNotification");
                        }}
                      >
                        Show Test Notification
                      </Button>
                    </div>
                  </Field>
                </>
              )}
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Others</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Google Apps"
                description="Allow notifications from Google Apps like Calendar, Meet, Chat, etc."
                configKey="notifications.allowFromGoogleApps"
                licenseKeyRequired
              />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Sound</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Play Sound"
                description="Play a sound when showing a notification."
                configKey="notifications.playSound"
              />
              {config["notifications.playSound"] && (
                <>
                  <Field>
                    <FieldLabel className="flex items-center gap-2">
                      Sound
                      {!isLicenseKeyValid && <Badge variant="secondary">Meru Pro Required</Badge>}
                    </FieldLabel>
                    <FieldDescription>Select the sound to play for notifications.</FieldDescription>
                    <Select
                      items={Object.entries(NOTIFICATION_SOUNDS).map(([sound, { label }]) => ({
                        value: sound,
                        label,
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
                      <SelectTrigger>
                        <SelectValue placeholder="Select sound" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(NOTIFICATION_SOUNDS).map(([sound, { label }]) => (
                          <SelectItem key={sound} value={sound}>
                            {label}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {config["notifications.sound"] !== "system" && (
                    <Field>
                      <FieldTitle>
                        Volume {(config["notifications.volume"] * 100).toFixed(0)}%
                      </FieldTitle>
                      <FieldDescription>
                        Set the volume level for notification sounds.
                      </FieldDescription>
                      <Slider
                        className="my-2"
                        step={5}
                        value={[config["notifications.volume"] * 100]}
                        onValueChange={(value) => {
                          if (typeof value !== "number") {
                            return;
                          }

                          const volume = value / 100;

                          if (volume) {
                            configMutation.mutate({
                              "notifications.volume": volume,
                            });
                          }
                        }}
                        onValueCommitted={(value) => {
                          if (typeof value !== "number") {
                            return;
                          }

                          const volume = value / 100;

                          if (volume && config["notifications.sound"] !== "system") {
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
