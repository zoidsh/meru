import { useLingui } from "@lingui/react/macro";
import { debounce, noop } from "es-toolkit";
import { PlayIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import type { PageSettings, SettingChange } from "#contract/settings.ts";
import type { OverridableSettingKey } from "#core/settings.ts";
import { NOTIFICATION_SOUNDS, isNotificationSound } from "#core/sounds.ts";
import type { NotificationSound, SoundChoice } from "#core/sounds.ts";
import { Button } from "#ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#ui/card.tsx";
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
import { QuietHoursField } from "./quiet-hours-field.tsx";
import { DiffersLine, OverrideCaption, ResetButton } from "./row-scope.tsx";
import type { RowScope } from "./row-scope.tsx";
import { ScopeTabs } from "./scope-tabs.tsx";
import {
  appValueText,
  differingProfiles,
  effectiveSettings,
  isScoped,
  shownScope,
} from "./scope.ts";
import type { Scope } from "./scope.ts";
import { Rows, SettingRow } from "./setting-row.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";
import { VolumeSlider } from "./volume-slider.tsx";
import { volumeSound } from "./volume.ts";

/** In the order the Sound menu lists them. */
const SOUND_ORDER: readonly SoundChoice[] = [
  "none",
  "system",
  ...NOTIFICATION_SOUNDS,
];

/**
 * How long after the last committed volume its preview waits, so a held
 * arrow key, which commits each step, plays one sound and not a pile of them.
 */
const VOLUME_PREVIEW_WAIT = 250;

type BooleanKey = {
  [Key in keyof PageSettings]: PageSettings[Key] extends boolean ? Key : never;
}[keyof PageSettings];

export const NotificationsPage = () => {
  const { t, i18n } = useLingui();
  const settings = useSettingsState("settings");
  const doNotDisturb = useSettingsState("doNotDisturb");
  const profiles = useSettingsState("profiles");
  const [chosenScope, setChosenScope] = useState<Scope>("all");
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
  const scoped = isScoped(profiles);
  const scope = shownScope(chosenScope, profiles);

  // A scope that fell back stays fallen back, even once its profile's id
  // could show again.
  if (scope !== chosenScope) {
    setChosenScope(scope);
  }

  const profile = profiles.find((candidate) => candidate.id === scope);
  const values = effectiveSettings(settings, profile);
  const pausedLine = scoped
    ? t({
        message: "Off for all profiles",
        comment:
          "Line under a notification setting in Settings while Do Not Disturb holds every notification, whatever the setting or a profile says",
      })
    : t({
        message: "Off while Do Not Disturb is on",
        comment:
          "Line under a notification setting in Settings while Do Not Disturb holds every notification, whatever the setting says",
      });
  const paused = doNotDisturb.on ? pausedLine : undefined;

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

  const write = <Key extends OverridableSettingKey>(
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

  /** What the row adds in the scope shown; nothing while the page has no scopes. */
  const rowScope = (key: OverridableSettingKey, label: string): RowScope => {
    if (!scoped) {
      return {};
    }

    if (!profile) {
      const differing = differingProfiles(profiles, key);

      return differing.length > 0
        ? {
            line: <DiffersLine differing={differing} onShow={setChosenScope} />,
          }
        : {};
    }

    if (!Object.hasOwn(profile.overrides, key)) {
      return {
        line: <OverrideCaption name={profile.name} appValue={undefined} />,
      };
    }

    return {
      line: (
        <OverrideCaption
          name={profile.name}
          appValue={appValueText(key, settings[key], soundNames, i18n.locale)}
        />
      ),
      reset: (
        <ResetButton
          label={label}
          onClick={() => {
            calls.clearOverride({ profileId: profile.id, key }).catch(noop);
          }}
        />
      ),
      bar: profile.color,
    };
  };

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
      scope={rowScope(key, label)}
    >
      {(ids) => (
        <Switch
          checked={values[key]}
          aria-labelledby={ids.label}
          aria-describedby={ids.description || undefined}
          onCheckedChange={(checked) => {
            write(key, checked);
          }}
        />
      )}
    </SettingRow>
  );

  const soundLabel = t({
    message: "Sound",
    comment:
      "Label of the menu in Settings choosing the sound a new mail notification makes",
  });
  const testBlocked = t({
    message: "Turn off Do Not Disturb to show a test notification.",
    comment:
      "Tooltip and description of the disabled Show test notification button in Settings while Do Not Disturb holds every notification",
  });
  const volumeHeardIn = volumeSound(settings.notificationSound, profiles);
  const shownSound = values.notificationSound;
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
      {!profile && (
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
                  description={doNotDisturbCaption(
                    doNotDisturb,
                    i18n.locale,
                    scoped
                  )}
                  paused={undefined}
                  scope={{}}
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
      )}
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
                label={soundLabel}
                paused={paused}
                scope={rowScope("notificationSound", soundLabel)}
              >
                {(ids) => (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t({
                        message: "Play sound",
                        comment:
                          "Name of the button in Settings beside the Sound menu that plays the chosen sound once",
                      })}
                      disabled={!isNotificationSound(shownSound)}
                      onClick={() => {
                        if (isNotificationSound(shownSound)) {
                          void calls.previewSound({ sound: shownSound });
                        }
                      }}
                    >
                      <PlayIcon />
                    </Button>
                    <Select
                      items={SOUND_ORDER.map((sound) => ({
                        value: sound,
                        label: soundNames[sound],
                      }))}
                      value={values.notificationSound}
                      onValueChange={(value) => {
                        if (value !== null) {
                          write("notificationSound", value);
                        }

                        if (isNotificationSound(value)) {
                          void calls.previewSound({ sound: value });
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
                  </>
                )}
              </SettingRow>,
              ...(profile
                ? []
                : [
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
                scope={rowScope("quietHours", quietHoursLabel)}
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
                description={t({
                  message:
                    "Show a test notification to see how notifications appear.",
                  comment:
                    "Description of the Test notification row in Settings",
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
                          aria-describedby={[
                            ids.description,
                            doNotDisturb.on && testBlockedId,
                          ]
                            .filter(Boolean)
                            .join(" ")}
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
                        message: "Show test notification",
                        comment:
                          "Button in Settings that shows a sample new mail notification, as the settings above would show one",
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
              ...(scoped
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
      {profile && (
        <p className="px-1 text-sm text-muted-foreground">
          {t({
            message:
              "Do Not Disturb is the same for every profile, under All profiles.",
            comment:
              "Line under the cards of the Notifications page in Settings while one profile's scope is chosen",
          })}
        </p>
      )}
    </>
  );

  if (!scoped) {
    return cards;
  }

  return (
    <ScopeTabs profiles={profiles} scope={scope} onScope={setChosenScope}>
      {cards}
    </ScopeTabs>
  );
};
