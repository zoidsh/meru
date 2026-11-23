import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { BanIcon, CheckIcon } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { SettingsState } from "#contract/settings.ts";
import { PROFILE_COLORS, PROFILE_COLOR_NAMES } from "#core/profile-color.ts";
import type { ProfileColorName } from "#core/profile-color.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";
import { Button } from "#ui/button.tsx";
import { Card, CardContent } from "#ui/card.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "#ui/field.tsx";
import { Input } from "#ui/input.tsx";
import { Switch } from "#ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "#ui/toggle-group.tsx";

import { SavedSearchesCard } from "./saved-searches-card.tsx";
import { AccountLine, accountShown } from "./signed-in.tsx";
import { settingsCalls } from "./sync.ts";

type ListedProfile = SettingsState["profiles"][number];

const Row = ({
  label,
  description,
  disabled = false,
  children,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  children: (ids: { label: string; description: string }) => ReactNode;
}) => {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <FieldContent>
        <FieldLabel id={labelId}>{label}</FieldLabel>
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      </FieldContent>
      <div className="flex items-center gap-2">
        {children({ label: labelId, description: descriptionId })}
      </div>
    </Field>
  );
};

/**
 * The name as typed until it is saved on Enter, on leaving the field or on
 * leaving the page; Escape puts back the stored one.
 */
const NameInput = ({
  profile,
  focusNow,
  onFocused,
  ids,
}: {
  profile: ListedProfile;
  focusNow: boolean;
  onFocused: () => void;
  ids: { label: string; description: string };
}) => {
  // What is typed over the stored name, which a new stored name replaces.
  const [draft, setDraft] = useState<{ text: string; over: string }>();
  const input = useRef<HTMLInputElement>(null);
  const typed = draft?.over === profile.name ? draft.text : undefined;

  useEffect(() => {
    if (focusNow) {
      input.current?.focus();
      input.current?.select();
      onFocused();
    }
  }, [focusNow, onFocused]);

  const save = () => {
    const name = typed?.trim();

    // Core refuses an empty name, and the stored one is the shown one.
    if (name === undefined || name === "" || name === profile.name) {
      setDraft(undefined);

      return;
    }

    setDraft({ text: name, over: profile.name });
    settingsCalls()
      .renameProfile({ profileId: profile.id, name })
      .catch(() => {
        setDraft(undefined);
      });
  };

  // Leaving the page by the menu's Back or by closing the window blurs
  // nothing, so what is typed is saved as the field or the document goes.
  const saveOnLeaving = useEffectEvent(save);

  useEffect(() => {
    const onPageHide = () => {
      saveOnLeaving();
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      saveOnLeaving();
    };
  }, []);

  return (
    <Input
      ref={input}
      value={typed ?? profile.name}
      maxLength={PROFILE_NAME_MAX_LENGTH}
      autoComplete="off"
      spellCheck={false}
      aria-labelledby={ids.label}
      aria-describedby={ids.description}
      onChange={(event) => {
        setDraft({ text: event.target.value, over: profile.name });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          save();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(undefined);
        }
      }}
      onBlur={save}
      className="w-55"
    />
  );
};

/**
 * A profile's own page inside Profiles: its name, colour, mail and sleep, its
 * saved searches and its removal.
 */
export const ProfilePage = ({
  profile,
  count,
  lastAwake,
  lastEnabled,
  focusName,
  onNameFocused,
  onRemoveAsked,
}: {
  profile: ListedProfile;
  /** How many profiles there are. */
  count: number;
  /** Whether it is the one profile awake, which cannot sleep. */
  lastAwake: boolean;
  /** Whether it is the one profile enabled, which can be neither turned off nor removed. */
  lastEnabled: boolean;
  /** Whether to focus the name with its text chosen, as for one just added. */
  focusName: boolean;
  onNameFocused: () => void;
  /** Before the removal is asked for, which may be confirmed or not. */
  onRemoveAsked: () => void;
}) => {
  const { t } = useLingui();
  const calls = settingsCalls();
  const colorNames: Record<ProfileColorName, string> = {
    blue: t({ message: "Blue", comment: "Name of a profile's colour" }),
    orange: t({ message: "Orange", comment: "Name of a profile's colour" }),
    green: t({ message: "Green", comment: "Name of a profile's colour" }),
    pink: t({ message: "Pink", comment: "Name of a profile's colour" }),
    cyan: t({ message: "Cyan", comment: "Name of a profile's colour" }),
    lime: t({ message: "Lime", comment: "Name of a profile's colour" }),
    amber: t({ message: "Amber", comment: "Name of a profile's colour" }),
    violet: t({ message: "Violet", comment: "Name of a profile's colour" }),
  };
  const removable = count > 1 && !lastEnabled;
  const many = count > 1;
  const off = !profile.enabled;
  let checkMailDescription: string;

  if (off) {
    checkMailDescription = t({
      message:
        "A disabled profile checks no mail; this applies once it is enabled.",
      comment:
        "Description of Check mail on a disabled profile's page in Settings, whose switch is disabled",
    });
  } else if (profile.checkMail) {
    checkMailDescription = many
      ? t({
          message:
            "Its unread count, notifications and place in the Unified inbox come from this.",
          comment:
            "Description of Check mail, turned on, on a profile's page in Settings when there are several profiles",
        })
      : t({
          message: "Its unread count and notifications come from this.",
          comment:
            "Description of Check mail, turned on, on the only profile's page in Settings, which has no Unified inbox",
        });
  } else {
    checkMailDescription = many
      ? t({
          message:
            "Off: no unread count, no notifications, and nothing in the Unified inbox.",
          comment:
            "Description of Check mail, turned off, on a profile's page in Settings when there are several profiles",
        })
      : t({
          message: "Off: no unread count and no notifications.",
          comment:
            "Description of Check mail, turned off, on the only profile's page in Settings, which has no Unified inbox",
        });
  }

  const stillChecked = profile.checkMail
    ? ` ${t({
        message: "Its mail is still checked.",
        comment:
          "Second sentence of Sleep's description on a profile's page in Settings, while its Check mail is on",
      })}`
    : "";
  let sleepDescription: string;

  if (off) {
    sleepDescription = t({
      message: "A disabled profile has no pages.",
      comment:
        "Description of Sleep on a disabled profile's page in Settings, whose switch is disabled",
    });
  } else if (lastAwake) {
    sleepDescription = t({
      message: "The last awake profile can't sleep.",
      comment:
        "Description of Sleep on a profile's page in Settings, whose switch is disabled since every other profile sleeps",
    });
  } else if (profile.asleep) {
    sleepDescription = `${t({
      message: "Its pages stay closed until it is selected again.",
      comment:
        "Description of Sleep, turned on, on a profile's page in Settings",
    })}${stillChecked}`;
  } else {
    sleepDescription = `${t({
      message: "Closes its pages until it is selected again.",
      comment:
        "Description of Sleep, turned off, on a profile's page in Settings",
    })}${stillChecked}`;
  }

  let enabledDescription: string;

  if (lastEnabled) {
    enabledDescription = t({
      message: "Meru needs at least one profile turned on.",
      comment:
        "Description of Enabled on the page of the only enabled profile in Settings, whose switch is disabled",
    });
  } else if (off) {
    enabledDescription = t({
      message:
        "Off: it stays signed in. Turn it on to put it back in the titlebar.",
      comment:
        "Description of Enabled, turned off, on a profile's page in Settings",
    });
  } else {
    enabledDescription = t({
      message:
        "Turned off, it stays signed in but leaves the titlebar, the Unified inbox and the profile shortcuts, and its mail is not checked.",
      comment:
        "Description of Enabled, turned on, on a profile's page in Settings",
    });
  }

  let removeDescription: string;

  if (count === 1) {
    removeDescription = t({
      message: "Meru needs at least one profile, so the last can't be removed.",
      comment:
        "Description of Remove profile on the page of the only profile in Settings, whose button is disabled",
    });
  } else if (lastEnabled) {
    removeDescription = t({
      message:
        "Meru needs at least one profile turned on, so the last can't be removed.",
      comment:
        "Description of Remove profile on the page of the only enabled profile in Settings, whose button is disabled",
    });
  } else {
    removeDescription = t({
      message:
        "Signs out of this profile and deletes its data on this device. Your Google account isn't affected.",
      comment: "Description of Remove profile on a profile's page in Settings",
    });
  }

  return (
    <>
      {off ? (
        <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
          <BanIcon aria-hidden className="size-3.5 shrink-0" />
          {t({
            message:
              "Disabled: not in the titlebar, the Unified inbox or the profile shortcuts, and its mail is not checked. It stays signed in.",
            comment: "Line at the top of a disabled profile's page in Settings",
          })}
        </p>
      ) : (
        accountShown(profile) && <AccountLine profile={profile} />
      )}
      <Card>
        <CardContent>
          <FieldGroup>
            {many && (
              <>
                <Row
                  label={t({
                    message: "Enabled",
                    comment:
                      "Label of the switch on a profile's page in Settings that turns the profile off or on; off, it leaves the titlebar and its mail is not checked",
                  })}
                  description={enabledDescription}
                  disabled={lastEnabled}
                >
                  {(ids) => (
                    <Switch
                      checked={profile.enabled}
                      disabled={lastEnabled}
                      aria-labelledby={ids.label}
                      aria-describedby={ids.description}
                      onCheckedChange={(enabled) => {
                        calls
                          .setProfileEnabled({ profileId: profile.id, enabled })
                          .catch(noop);
                      }}
                    />
                  )}
                </Row>
                <FieldSeparator />
              </>
            )}
            <Row
              label={t({
                message: "Name",
                comment: "Label of a profile's name on its page in Settings",
              })}
              description={t({
                message: "On its button in the titlebar.",
                comment:
                  "Description of a profile's name on its page in Settings",
              })}
            >
              {(ids) => (
                <NameInput
                  profile={profile}
                  focusNow={focusName}
                  onFocused={onNameFocused}
                  ids={ids}
                />
              )}
            </Row>
            <FieldSeparator />
            <Row
              label={t({
                message: "Colour",
                comment: "Label of a profile's colour on its page in Settings",
              })}
              description={t({
                message:
                  "Its dot, and the titlebar's and sidebar's tint while it is selected.",
                comment:
                  "Description of a profile's colour on its page in Settings",
              })}
            >
              {(ids) => (
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description}
                  value={[profile.colorName]}
                  onValueChange={([color]) => {
                    // Pressing the chosen colour leaves it chosen.
                    if (color !== undefined) {
                      calls
                        .setProfileColor({
                          profileId: profile.id,
                          color: color as ProfileColorName,
                        })
                        .catch(noop);
                    }
                  }}
                >
                  {PROFILE_COLOR_NAMES.map((name, index) => (
                    <ToggleGroupItem
                      key={name}
                      value={name}
                      aria-label={colorNames[name]}
                      title={colorNames[name]}
                      // Joined items take their padding through the group,
                      // which a plain px-0 does not outrank.
                      className="group-data-[spacing=0]/toggle-group:px-0"
                    >
                      <span
                        aria-hidden
                        className="flex size-4 items-center justify-center rounded-full text-white shadow-[inset_0_0_0_1px_oklch(0_0_0/0.12)]"
                        style={{ background: PROFILE_COLORS[index] }}
                      >
                        {name === profile.colorName && (
                          <CheckIcon className="size-3" strokeWidth={3.5} />
                        )}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </Row>
            <FieldSeparator />
            <Row
              label={t({
                message: "Check mail",
                comment:
                  "Label of the switch on a profile's page in Settings that turns checking its mail on or off",
              })}
              description={checkMailDescription}
              disabled={off}
            >
              {(ids) => (
                <Switch
                  checked={profile.checkMail}
                  disabled={off}
                  aria-labelledby={ids.label}
                  aria-describedby={ids.description}
                  onCheckedChange={(on) => {
                    calls
                      .setCheckMail({ profileId: profile.id, on })
                      .catch(noop);
                  }}
                />
              )}
            </Row>
            {many && (
              <>
                <FieldSeparator />
                <Row
                  label={t({
                    message: "Sleep",
                    comment:
                      "Label of the switch on a profile's page in Settings that puts it to sleep or wakes it",
                  })}
                  description={sleepDescription}
                  disabled={lastAwake || off}
                >
                  {(ids) => (
                    <Switch
                      checked={profile.asleep && !off}
                      disabled={lastAwake || off}
                      aria-labelledby={ids.label}
                      aria-describedby={ids.description}
                      onCheckedChange={(asleep) => {
                        calls
                          .setAsleep({ profileId: profile.id, asleep })
                          .catch(noop);
                      }}
                    />
                  )}
                </Row>
              </>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      <SavedSearchesCard profile={profile} />
      <Card>
        <CardContent>
          <Row
            label={t({
              message: "Remove profile",
              comment:
                "Label of the row on a profile's page in Settings that removes it",
            })}
            description={removeDescription}
          >
            {(ids) => (
              <Button
                variant="destructive"
                size="sm"
                disabled={!removable}
                aria-describedby={ids.description}
                onClick={() => {
                  onRemoveAsked();
                  calls.removeProfile({ profileId: profile.id }).catch(noop);
                }}
              >
                {t({
                  message: "Remove profile…",
                  comment:
                    "Button on a profile's page in Settings that asks to remove it",
                })}
              </Button>
            )}
          </Row>
        </CardContent>
      </Card>
    </>
  );
};
