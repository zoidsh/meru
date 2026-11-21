import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { useId } from "react";
import type { ReactNode } from "react";

import type { PageSettings } from "#contract/settings.ts";
import type { SoundChoice } from "#core/sounds.ts";
import { Card, CardContent, CardHeader, CardTitle } from "#ui/card.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "#ui/field.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { doNotDisturbCaption } from "./do-not-disturb.ts";
import { QuietHoursField } from "./quiet-hours-field.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/** In the order the Sound menu lists them. */
const SOUND_ORDER: readonly SoundChoice[] = [
  "none",
  "system",
  "breeze",
  "chime",
  "duet",
  "knock",
  "linen",
];

type BooleanKey = {
  [Key in keyof PageSettings]: PageSettings[Key] extends boolean ? Key : never;
}[keyof PageSettings];

/**
 * A row of the page: its label and descriptions, and its control. While Do
 * Not Disturb outranks it, it dims, says so and still works.
 */
const SettingRow = ({
  label,
  description,
  paused = false,
  children,
}: {
  label: string;
  description?: string | undefined;
  paused?: boolean;
  children: (ids: { label: string; description: string }) => ReactNode;
}) => {
  const { t } = useLingui();
  const labelId = useId();
  const descriptionId = useId();
  const pausedId = useId();
  const describedBy = [description && descriptionId, paused && pausedId]
    .filter(Boolean)
    .join(" ");

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel id={labelId} className={cn(paused && "opacity-50")}>
          {label}
        </FieldLabel>
        {description && (
          <FieldDescription
            id={descriptionId}
            className={cn(paused && "opacity-50")}
          >
            {description}
          </FieldDescription>
        )}
        {paused && (
          <FieldDescription id={pausedId}>
            {t({
              message: "Off while Do Not Disturb is on",
              comment:
                "Line under a notification setting in Settings while Do Not Disturb holds every notification, whatever the setting says",
            })}
          </FieldDescription>
        )}
      </FieldContent>
      <div className={cn("flex items-center gap-2", paused && "opacity-50")}>
        {children({ label: labelId, description: describedBy })}
      </div>
    </Field>
  );
};

/** Rows with a separator between each. */
const Rows = ({ children }: { children: ReactNode[] }) => (
  <FieldGroup>
    {children.flatMap((row, index) =>
      index === 0 ? [row] : [<FieldSeparator key={`separator-${index}`} />, row]
    )}
  </FieldGroup>
);

export const NotificationsPage = () => {
  const { t, i18n } = useLingui();
  const settings = useSettingsState("settings");
  const doNotDisturb = useSettingsState("doNotDisturb");
  const profileCount = useSettingsState("profileCount");

  if (!settings || !doNotDisturb || profileCount === undefined) {
    return null;
  }

  const calls = settingsCalls();
  const paused = doNotDisturb.on;

  const switchRow = (
    key: BooleanKey,
    label: string,
    description?: string,
    pausable = false
  ) => (
    <SettingRow
      key={key}
      label={label}
      description={description}
      paused={pausable && paused}
    >
      {(ids) => (
        <Switch
          checked={settings[key]}
          aria-labelledby={ids.label}
          aria-describedby={ids.description || undefined}
          onCheckedChange={(checked) => {
            void calls.update({ key, value: checked });
          }}
        />
      )}
    </SettingRow>
  );

  const soundNames: Record<SoundChoice, string> = {
    none: t({
      message: "None",
      comment:
        "Choice of the Sound menu in Settings: no sound with a notification",
    }),
    system: t({
      message: "System",
      comment:
        "Choice of the Sound menu in Settings: the system's own notification sound",
    }),
    breeze: t({
      message: "Breeze",
      comment: "Name of a notification sound, picked in Settings",
    }),
    chime: t({
      message: "Chime",
      comment: "Name of a notification sound, picked in Settings",
    }),
    duet: t({
      message: "Duet",
      comment: "Name of a notification sound, picked in Settings",
    }),
    knock: t({
      message: "Knock",
      comment: "Name of a notification sound, picked in Settings",
    }),
    linen: t({
      message: "Linen",
      comment: "Name of a notification sound, picked in Settings",
    }),
  };

  return (
    <>
      <Card>
        <CardContent>
          <Rows>
            {[
              <SettingRow
                key="doNotDisturb"
                label={t({
                  message: "Do Not Disturb",
                  comment:
                    "Label of the switch in Settings that holds every notification until turned off",
                })}
                description={doNotDisturbCaption(doNotDisturb, i18n.locale)}
              >
                {(ids) => (
                  <Switch
                    checked={doNotDisturb.on}
                    aria-labelledby={ids.label}
                    aria-describedby={ids.description || undefined}
                    onCheckedChange={(on) => {
                      void calls.setDoNotDisturb({ on });
                    }}
                  />
                )}
              </SettingRow>,
            ]}
          </Rows>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {t({
              message: "New mail",
              comment:
                "Title of the group of Settings for how new mail is announced",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Rows>
            {[
              switchRow(
                "notifications",
                t({
                  message: "Notifications",
                  comment:
                    "Label of the switch in Settings that shows a notification for new mail",
                }),
                t({
                  message: "A notification for each new message.",
                  comment:
                    "Description of the Notifications switch in Settings",
                }),
                true
              ),
              switchRow(
                "notificationImportantOnly",
                t({
                  message: "Important mail only",
                  comment:
                    "Label of the switch in Settings that limits notifications to mail Gmail marks important",
                }),
                t({
                  message:
                    "Only mail Gmail marks important gets a notification.",
                  comment:
                    "Description of the Important mail only switch in Settings",
                }),
                true
              ),
              <SettingRow
                key="notificationSound"
                label={t({
                  message: "Sound",
                  comment:
                    "Label of the menu in Settings choosing the sound a new mail notification makes",
                })}
                paused={paused}
              >
                {(ids) => (
                  <Select
                    items={SOUND_ORDER.map((sound) => ({
                      value: sound,
                      label: soundNames[sound],
                    }))}
                    value={settings.notificationSound}
                    onValueChange={(value) => {
                      if (value !== null) {
                        void calls.update({
                          key: "notificationSound",
                          value,
                        });
                      }
                    }}
                  >
                    <SelectTrigger
                      aria-labelledby={ids.label}
                      className="min-w-28"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {SOUND_ORDER.map((sound) => (
                          <SelectItem key={sound} value={sound}>
                            {soundNames[sound]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </SettingRow>,
              <QuietHoursField
                key="quietHours"
                list={settings.quietHours}
                paused={paused}
                onChange={(value) => {
                  void calls.update({ key: "quietHours", value: [...value] });
                }}
              />,
            ]}
          </Rows>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {t({
              message: "What a notification shows",
              comment:
                "Title of the group of Settings for what a new mail notification says",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Rows>
            {[
              switchRow(
                "notificationSender",
                t({
                  message: "Show the sender",
                  comment:
                    "Label of the switch in Settings that names who sent the mail in its notification",
                })
              ),
              switchRow(
                "notificationSubject",
                t({
                  message: "Show the subject",
                  comment:
                    "Label of the switch in Settings that shows the mail's subject in its notification",
                })
              ),
              switchRow(
                "notificationSummary",
                t({
                  message: "Show the summary",
                  comment:
                    "Label of the switch in Settings that shows the start of the mail's text in its notification",
                })
              ),
            ]}
          </Rows>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            {t({
              message: "Unread mail",
              comment:
                "Title of the group of Settings for how unread mail is counted and listed",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Rows>
            {[
              switchRow(
                "unreadBadge",
                t({
                  message: "Count unread in the badge",
                  comment:
                    "Label of the switch in Settings that adds unread mail to the number on the app's icon",
                }),
                document.documentElement.dataset.platform === "darwin"
                  ? t({
                      message:
                        "Unread mail adds to the number on the Dock icon.",
                      comment:
                        "Description of the Count unread in the badge switch in Settings on macOS; the Dock is where macOS shows the app's icon",
                    })
                  : t({
                      message:
                        "Unread mail adds to the number on the app's icon.",
                      comment:
                        "Description of the Count unread in the badge switch in Settings on Windows and Linux",
                    })
              ),
              ...(profileCount >= 2
                ? [
                    switchRow(
                      "unifiedInbox",
                      t({
                        message: "Show in the Unified inbox",
                        comment:
                          "Label of the switch in Settings that lists unread mail in the Unified inbox, the list of every profile's unread mail",
                      }),
                      t({
                        message:
                          "Unread mail is listed with the other profiles'.",
                        comment:
                          "Description of the Show in the Unified inbox switch in Settings",
                      })
                    ),
                  ]
                : []),
            ]}
          </Rows>
        </CardContent>
      </Card>
    </>
  );
};
