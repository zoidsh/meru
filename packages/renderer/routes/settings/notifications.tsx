import { useTranslation } from "@meru/i18n/provider";
import { ipc } from "@meru/renderer-lib/ipc";
import { platform } from "@meru/renderer-lib/utils";
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
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import type { NotificationTime } from "@meru/shared/types";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

function timeToMinutes(time: string) {
  const colonIndex = time.indexOf(":");
  return Number(time.slice(0, colonIndex)) * 60 + Number(time.slice(colonIndex + 1));
}

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

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
  const { t } = useTranslation();

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
      toast.error(t("settings.notifications.noFreeSlot"));

      return;
    }

    const newEntry: NotificationTime = { id: crypto.randomUUID(), ...slot };

    configMutation.mutate({ "notifications.times": [...times, newEntry] });
  };

  const updateTime = (id: string, field: "start" | "end", value: string) => {
    const newTimes = times.map((time) => (time.id === id ? { ...time, [field]: value } : time));

    if (hasOverlap(newTimes)) {
      toast.error(t("settings.notifications.timesOverlap"));

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
        <SettingsTitle>{t("settings.notifications.title")}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t("settings.notifications.emails")}</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t("settings.notifications.newEmails")}
                description={t("settings.notifications.newEmailsDescription")}
                configKey="notifications.enabled"
              />
              {config["notifications.enabled"] && (
                <>
                  <ConfigSwitchField
                    label={t("settings.notifications.showSender")}
                    description={t("settings.notifications.showSenderDescription")}
                    configKey="notifications.showSender"
                  />
                  <ConfigSwitchField
                    label={t("settings.notifications.showSubject")}
                    description={t("settings.notifications.showSubjectDescription")}
                    configKey="notifications.showSubject"
                  />
                  {platform.isMacOS && (
                    <ConfigSwitchField
                      label={t("settings.notifications.showSummary")}
                      description={t("settings.notifications.showSummaryDescription")}
                      configKey="notifications.showSummary"
                    />
                  )}
                  <Field>
                    <FieldLabel className="flex items-center gap-2">
                      {t("settings.notifications.notificationTimes")}
                      {!isLicenseKeyValid && (
                        <Badge variant="secondary">{t("settings.common.meruProRequired")}</Badge>
                      )}
                    </FieldLabel>
                    <FieldDescription>
                      {t("settings.notifications.notificationTimesDescription")}
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
                            <span className="text-muted-foreground shrink-0 text-sm">
                              {t("settings.notifications.to")}
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
                            {([1, 2, 3, 4, 5, 6, 0] as const).map((dayIndex, position) => {
                              const dayKeys = [
                                "mon",
                                "tue",
                                "wed",
                                "thu",
                                "fri",
                                "sat",
                                "sun",
                              ] as const;
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
                                  {t(`settings.notifications.days.${dayKeys[position]}`)}
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
                        <Plus /> {t("settings.notifications.addTimeWindow")}
                      </Button>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>{t("settings.notifications.testNotification")}</FieldLabel>
                    <FieldDescription>
                      {t("settings.notifications.testNotificationDescription")}
                    </FieldDescription>
                    <div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (config["doNotDisturb.enabled"]) {
                            toast.error(t("settings.notifications.dndBlocksTest"));

                            return;
                          }

                          ipc.main.send("notifications.showTestNotification");
                        }}
                      >
                        {t("settings.notifications.showTestNotification")}
                      </Button>
                    </div>
                  </Field>
                </>
              )}
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.notifications.others")}</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t("settings.notifications.downloads")}
                description={t("settings.notifications.downloadsDescription")}
                configKey="notifications.downloadCompleted"
              />
              <ConfigSwitchField
                label={t("settings.notifications.googleApps")}
                description={t("settings.notifications.googleAppsDescription")}
                configKey="notifications.allowFromGoogleApps"
                licenseKeyRequired
              />
            </FieldGroup>
          </FieldSet>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>{t("settings.notifications.sound")}</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t("settings.notifications.playSound")}
                description={t("settings.notifications.playSoundDescription")}
                configKey="notifications.playSound"
              />
              {config["notifications.playSound"] && (
                <>
                  <Field>
                    <FieldLabel className="flex items-center gap-2">
                      {t("settings.notifications.soundField")}
                      {!isLicenseKeyValid && (
                        <Badge variant="secondary">{t("settings.common.meruProRequired")}</Badge>
                      )}
                    </FieldLabel>
                    <FieldDescription>
                      {t("settings.notifications.soundFieldDescription")}
                    </FieldDescription>
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
                        <SelectValue placeholder={t("settings.notifications.selectSound")} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(NOTIFICATION_SOUNDS).map(([sound, { label }]) => (
                          <SelectItem key={sound} value={sound}>
                            {label}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="system">{t("settings.notifications.system")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {config["notifications.sound"] !== "system" && (
                    <Field>
                      <FieldTitle>
                        {t("settings.notifications.volume", {
                          percent: (config["notifications.volume"] * 100).toFixed(0),
                        })}
                      </FieldTitle>
                      <FieldDescription>
                        {t("settings.notifications.volumeDescription")}
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
