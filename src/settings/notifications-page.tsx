import { useLingui } from "@lingui/react/macro";
import { debounce, noop } from "es-toolkit";
import { PlayIcon } from "lucide-react";
import { useEffect, useId, useMemo } from "react";

import { NOTIFICATIONS_OVERRIDABLE_KEYS } from "#contract/settings.ts";
import type {
  PageOverridableKey,
  PageSettings,
  SettingChange,
} from "#contract/settings.ts";
import {
  NEW_EMAIL_SOUNDS,
  OTHER_SOUNDS,
  isNotificationSound,
} from "#core/sounds.ts";
import type {
  NewEmailSoundChoice,
  NotificationSound,
  OtherSoundChoice,
  SoundChoice,
} from "#core/sounds.ts";
import { useNowByTheDay } from "#shared/now-by-the-day.ts";
import { Button } from "#ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#ui/tooltip.tsx";

import { doNotDisturbCaption } from "./do-not-disturb.ts";
import { usePageScope } from "./page-scope.tsx";
import { useNeedsPro } from "./pro-badge.tsx";
import { QuietHoursField } from "./quiet-hours-field.tsx";
import { appValueText, effectiveSettings } from "./scope.ts";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";
import { VolumeSlider } from "./volume-slider.tsx";
import { volumeSound } from "./volume.ts";

/** In the order each sound menu lists them. */
const NEW_EMAIL_ORDER: readonly NewEmailSoundChoice[] = [
  "none",
  "system",
  ...NEW_EMAIL_SOUNDS,
];
const OTHER_ORDER: readonly OtherSoundChoice[] = [
  "none",
  "system",
  ...OTHER_SOUNDS,
];

/**
 * How long after the last committed volume its preview waits, so a held
 * arrow key, which commits each step, plays one sound and not a pile of them.
 */
const VOLUME_PREVIEW_WAIT = 250;

type BooleanKey = {
  [Key in PageOverridableKey]: PageSettings[Key] extends boolean ? Key : never;
}[PageOverridableKey];

export const NotificationsPage = () => {
  const { t, i18n } = useLingui();
  const settings = useSettingsState("settings");
  const doNotDisturb = useSettingsState("doNotDisturb");
  const now = useNowByTheDay();
  const profiles = useSettingsState("profiles");
  const needsPro = useNeedsPro();
  const { profile, rowScope, page } = usePageScope(
    profiles,
    NOTIFICATIONS_OVERRIDABLE_KEYS
  );
  const testBlockedId = useId();
  const previewVolume = useMemo(
    () =>
      debounce((sound: NotificationSound) => {
        void settingsCalls().previewSound({ sound });
      }, VOLUME_PREVIEW_WAIT),
    []
  );

  useEffect(() => previewVolume.cancel, [previewVolume]);

  if (!settings || !doNotDisturb || !profiles) {
    return null;
  }

  const calls = settingsCalls();
  const values = effectiveSettings(settings, profile);
  const paused = doNotDisturb.on
    ? t({
        message: "Do Not Disturb is on.",
        comment:
          "Line under a notification setting in Settings while Do Not Disturb holds every notification, whatever the setting or a profile says",
      })
    : undefined;

  const soundNames: Record<SoundChoice, string> = {
    none: t({
      message: "None",
      comment:
        "Choice of a sound menu in Settings: no sound with a notification",
    }),
    system: t({
      message: "System",
      comment:
        "Choice of a sound menu in Settings: the system's own notification sound",
    }),
    welcome: t({
      message: "Welcome",
      comment: "Name of a notification sound, picked in Settings",
    }),
    sunrise: t({
      message: "Sunrise",
      comment: "Name of a notification sound, picked in Settings",
    }),
    bloom: t({
      message: "Bloom",
      comment: "Name of a notification sound, picked in Settings",
    }),
    duet: t({
      message: "Duet",
      comment: "Name of a notification sound, picked in Settings",
    }),
    aurora: t({
      message: "Aurora",
      comment: "Name of a notification sound, picked in Settings",
    }),
    daybreak: t({
      message: "Daybreak",
      comment: "Name of a notification sound, picked in Settings",
    }),
    halo: t({
      message: "Halo",
      comment: "Name of a notification sound, picked in Settings",
    }),
    letter: t({
      message: "Letter",
      comment: "Name of a notification sound, picked in Settings",
    }),
    tide: t({
      message: "Tide",
      comment: "Name of a notification sound, picked in Settings",
    }),
    knock: t({
      message: "Knock",
      comment: "Name of a notification sound, picked in Settings",
    }),
    dew: t({
      message: "Dew",
      comment: "Name of a notification sound, picked in Settings",
    }),
    bead: t({
      message: "Bead",
      comment: "Name of a notification sound, picked in Settings",
    }),
    nod: t({
      message: "Nod",
      comment: "Name of a notification sound, picked in Settings",
    }),
    sip: t({
      message: "Sip",
      comment: "Name of a notification sound, picked in Settings",
    }),
    breath: t({
      message: "Breath",
      comment: "Name of a notification sound, picked in Settings",
    }),
    drop: t({
      message: "Drop",
      comment: "Name of a notification sound, picked in Settings",
    }),
    pair: t({
      message: "Pair",
      comment: "Name of a notification sound, picked in Settings",
    }),
    glint: t({
      message: "Glint",
      comment: "Name of a notification sound, picked in Settings",
    }),
    hush: t({
      message: "Hush",
      comment: "Name of a notification sound, picked in Settings",
    }),
  };

  const write = <Key extends PageOverridableKey>(
    key: Key,
    value: PageSettings[Key]
  ) => {
    const change = { key, value } as SettingChange;

    // Main refuses a profile removed since the page last heard, and the
    // page then shows main's state, so a refusal needs no more.
    void (profile
      ? calls.setOverride({ ...change, profileId: profile.id }).catch(noop)
      : calls.update(change));
  };

  const scopeOf = (key: PageOverridableKey, label: string) =>
    rowScope(key, label, () =>
      appValueText(key, settings[key], soundNames, i18n.locale)
    );

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
      paused={pausable ? paused : undefined}
      scope={scopeOf(key, label)}
      pro={needsPro.setting(key)}
      disabled={needsPro.setting(key)}
    >
      {(ids) => (
        <Switch
          checked={values[key]}
          disabled={needsPro.setting(key)}
          aria-labelledby={ids.label}
          aria-describedby={ids.description || undefined}
          onCheckedChange={(checked) => {
            write(key, checked);
          }}
        />
      )}
    </SettingRow>
  );

  const newEmailSoundLabel = t({
    message: "New email sound",
    comment:
      "Label of the menu in Settings choosing the sound a new mail notification makes",
  });
  const otherSoundLabel = t({
    message: "Other notifications sound",
    comment:
      "Label of the menu in Settings choosing the sound of every notification that is not new mail, such as a verification code's",
  });

  const soundRow = <Choice extends SoundChoice>(row: {
    key: "notificationSound" | "otherNotificationSound";
    label: string;
    playLabel: string;
    order: readonly Choice[];
    value: Choice;
    scope: ReturnType<typeof scopeOf>;
    onChange: (value: Choice) => void;
  }) => (
    <SettingRow
      key={row.key}
      label={row.label}
      paused={paused}
      scope={row.scope}
      pro={needsPro.capability("notificationSound")}
      disabled={needsPro.capability("notificationSound")}
    >
      {(ids) => (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={row.playLabel}
            disabled={!isNotificationSound(row.value)}
            onClick={() => {
              if (isNotificationSound(row.value)) {
                void calls.previewSound({ sound: row.value });
              }
            }}
          >
            <PlayIcon />
          </Button>
          <Select
            items={row.order.map((sound) => ({
              value: sound,
              label: soundNames[sound],
            }))}
            value={row.value}
            disabled={needsPro.capability("notificationSound")}
            onValueChange={(value) => {
              if (value !== null) {
                row.onChange(value);
              }

              if (isNotificationSound(value)) {
                void calls.previewSound({ sound: value });
              }
            }}
          >
            <SelectTrigger aria-labelledby={ids.label} className="min-w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {row.order.map((sound) => (
                  <SelectItem key={sound} value={sound}>
                    {soundNames[sound]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </>
      )}
    </SettingRow>
  );
  const testBlocked = t({
    message: "Turn off Do Not Disturb first.",
    comment:
      "Tooltip and description of the disabled Show button of Test notification in Settings while Do Not Disturb holds every notification",
  });
  const volumeHeardIn = volumeSound(
    settings.notificationSound,
    settings.otherNotificationSound,
    profiles
  );
  const volumeLabel = t({
    message: "Volume",
    comment:
      "Label of the slider in Settings setting how loud Meru's own notification sounds play",
  });
  const quietHoursLabel = t({
    message: "Quiet hours",
    comment:
      "Label of the list in Settings of the times when new mail notifications wait",
  });

  const cards = (
    <>
      <SettingGroups>
        {!profile && (
          <SettingGroup>
            <Rows>
              {[
                <SettingRow
                  key="doNotDisturb"
                  label={t({
                    message: "Do Not Disturb",
                    comment:
                      "Label of the switch in Settings that holds every notification until turned off",
                  })}
                  description={doNotDisturbCaption(
                    doNotDisturb,
                    i18n.locale,
                    now
                  )}
                  paused={undefined}
                  scope={{}}
                  pro={needsPro.capability("notificationGates")}
                  disabled={needsPro.capability("notificationGates")}
                >
                  {(ids) => (
                    <Switch
                      checked={doNotDisturb.on}
                      disabled={needsPro.capability("notificationGates")}
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
          </SettingGroup>
        )}
        <SettingGroup
          title={t({
            message: "New mail",
            comment:
              "Title of the group of Settings for how new mail is announced",
          })}
        >
          <Rows>
            {[
              switchRow(
                "notifications",
                t({
                  message: "Allow notifications",
                  comment:
                    "Label of the switch in Settings that shows a notification for new mail",
                }),
                undefined,
                true
              ),
              switchRow(
                "notificationImportantOnly",
                t({
                  message: "Only important mail",
                  comment:
                    "Label of the switch in Settings that limits notifications to mail Gmail marks important",
                }),
                t({
                  message:
                    "Only notifies you about email Gmail marks as important.",
                  comment:
                    "Description of the Only important mail switch in Settings; important is Gmail's own marking of mail",
                }),
                true
              ),
              soundRow({
                key: "notificationSound",
                label: newEmailSoundLabel,
                playLabel: t({
                  message: "Play new email sound",
                  comment:
                    "Name of the button in Settings beside the New email sound menu that plays the chosen sound once",
                }),
                order: NEW_EMAIL_ORDER,
                value: values.notificationSound,
                scope: scopeOf("notificationSound", newEmailSoundLabel),
                onChange: (value) => {
                  write("notificationSound", value);
                },
              }),
              ...(profile
                ? []
                : [
                    soundRow({
                      key: "otherNotificationSound",
                      label: otherSoundLabel,
                      playLabel: t({
                        message: "Play other notifications sound",
                        comment:
                          "Name of the button in Settings beside the Other notifications sound menu that plays the chosen sound once",
                      }),
                      order: OTHER_ORDER,
                      value: settings.otherNotificationSound,
                      scope: {},
                      onChange: (value) => {
                        void calls.update({
                          key: "otherNotificationSound",
                          value,
                        });
                      },
                    }),
                    <SettingRow
                      key="notificationSoundVolume"
                      label={volumeLabel}
                      paused={paused}
                      scope={{}}
                      disabled={!volumeHeardIn}
                    >
                      {(ids) => (
                        <VolumeSlider
                          labelId={ids.label}
                          volume={settings.notificationSoundVolume}
                          disabled={!volumeHeardIn}
                          onCommit={async (volume) => {
                            await calls.update({
                              key: "notificationSoundVolume",
                              value: volume,
                            });

                            if (volumeHeardIn) {
                              previewVolume(volumeHeardIn);
                            }
                          }}
                        />
                      )}
                    </SettingRow>,
                  ]),
              <QuietHoursField
                key="quietHours"
                label={quietHoursLabel}
                list={values.quietHours}
                paused={paused}
                scope={scopeOf("quietHours", quietHoursLabel)}
                pro={needsPro.setting("quietHours")}
                onChange={(value) => {
                  write("quietHours", [...value]);
                }}
              />,
              <SettingRow
                key="testNotification"
                label={t({
                  message: "Test notification",
                  comment:
                    "Label of the row in Settings whose button shows a sample new mail notification",
                })}
                paused={undefined}
                scope={{}}
              >
                {(ids) => (
                  // Disabled under Do Not Disturb yet still focusable, so its
                  // tooltip reaches the keyboard too; shadcn's Button dims
                  // only a `:disabled` one, hence the class.
                  <Tooltip disabled={!doNotDisturb.on}>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={doNotDisturb.on}
                          focusableWhenDisabled
                          className="aria-disabled:opacity-50"
                          aria-label={t({
                            message: "Show test notification",
                            comment:
                              "Accessible name of the Show button of the Test notification row in Settings; it starts with the button's visible label, Show",
                          })}
                          aria-describedby={
                            [ids.description, doNotDisturb.on && testBlockedId]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                          onClick={() => {
                            // Refused when Do Not Disturb turned on just
                            // before the click, which the button then shows.
                            calls
                              .showTestNotification({
                                profileId: profile?.id ?? null,
                              })
                              .catch(noop);
                          }}
                        />
                      }
                    >
                      {t({
                        message: "Show",
                        comment:
                          "Button of the Test notification row in Settings that shows a sample new mail notification, as the settings above would show one",
                      })}
                    </TooltipTrigger>
                    {/* Base UI gives its popup no role of its own. */}
                    <TooltipContent role="tooltip">
                      {testBlocked}
                    </TooltipContent>
                    {doNotDisturb.on && (
                      <span id={testBlockedId} className="sr-only">
                        {testBlocked}
                      </span>
                    )}
                  </Tooltip>
                )}
              </SettingRow>,
            ]}
          </Rows>
        </SettingGroup>
        <SettingGroup
          title={t({
            message: "What notifications show",
            comment:
              "Title of the group of Settings for what a new mail notification says",
          })}
        >
          <Rows>
            {[
              switchRow(
                "notificationSender",
                t({
                  message: "Show sender",
                  comment:
                    "Label of the switch in Settings that names who sent the mail in its notification",
                })
              ),
              switchRow(
                "notificationSubject",
                t({
                  message: "Show subject",
                  comment:
                    "Label of the switch in Settings that shows the mail's subject in its notification",
                })
              ),
              switchRow(
                "notificationSummary",
                t({
                  message: "Show preview",
                  comment:
                    "Label of the switch in Settings that shows the start of the mail's text in its notification",
                })
              ),
            ]}
          </Rows>
        </SettingGroup>
        <SettingGroup
          title={t({
            message: "Unread mail",
            comment:
              "Title of the group of Settings for how unread mail is counted and listed",
          })}
        >
          <Rows>
            {[
              switchRow(
                "unreadBadge",
                t({
                  message: "Show unread count",
                  comment:
                    "Label of the switch in Settings that adds unread mail to the number on the app's icon",
                }),
                document.documentElement.dataset.platform === "darwin"
                  ? t({
                      message:
                        "Shows how many unread emails you have on the Dock icon.",
                      comment:
                        "Description of the Show unread count switch in Settings on macOS; the Dock is where macOS shows the app's icon",
                    })
                  : t({
                      message:
                        "Shows how many unread emails you have on the app icon.",
                      comment:
                        "Description of the Show unread count switch in Settings on Windows and Linux",
                    })
              ),
            ]}
          </Rows>
        </SettingGroup>
      </SettingGroups>
      {profile && (
        <p className="px-1 text-sm text-muted-foreground">
          {t({
            message:
              "You set Do Not Disturb under All profiles. It applies to every profile.",
            comment:
              "Line under the cards of the Notifications page in Settings while one profile's scope is chosen",
          })}
        </p>
      )}
    </>
  );

  return page(cards);
};
