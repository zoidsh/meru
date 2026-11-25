import { useLingui } from "@lingui/react/macro";
import { noop } from "es-toolkit";
import { BanIcon } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { SettingsState } from "#contract/settings.ts";
import { PROFILE_COLOR_NAMES, paletteColor } from "#core/profile-color.ts";
import type { ProfileColorName } from "#core/profile-color.ts";
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";
import { Button } from "#ui/button.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "#ui/field.tsx";
import { Input } from "#ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#ui/select.tsx";
import { Switch } from "#ui/switch.tsx";

import { DeleteBrowsingData } from "./delete-browsing-data.tsx";
import { SavedSearchesCard } from "./saved-searches-card.tsx";
import { ProfileDot } from "./scope-tabs.tsx";
import { SettingGroup, SettingGroups } from "./setting-group.tsx";
import { AccountLine, accountShown } from "./signed-in.tsx";
import { settingsCalls } from "./sync.ts";

type ListedProfile = SettingsState["profiles"][number];

/** A color's dot and its name, in the Color menu and on its trigger. */
const ColorItem = ({
  name,
  label,
}: {
  name: ProfileColorName;
  label: string;
}) => (
  <>
    {/* The item's text is a flex row that does not center its children. */}
    <ProfileDot color={paletteColor(name)} className="size-2 self-center" />
    {label}
  </>
);

const Row = ({
  label,
  description,
  disabled = false,
  children,
}: {
  label: string;
  /** Nothing, or an empty string, shows no description. */
  description?: string | undefined;
  disabled?: boolean;
  /** `description` is empty while the row has none. */
  children: (ids: { label: string; description: string }) => ReactNode;
}) => {
  const labelId = useId();
  const descriptionId = useId();
  const described = Boolean(description);

  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <FieldContent>
        <FieldLabel id={labelId}>{label}</FieldLabel>
        {described && (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        )}
      </FieldContent>
      <div className="flex items-center gap-2">
        {children({
          label: labelId,
          description: described ? descriptionId : "",
        })}
      </div>
    </Field>
  );
};

/**
 * Whether the profile's unread mail is listed in the Unified inbox; disabled,
 * its value kept, while nothing of its mail is checked.
 */
const UnifiedInboxRow = ({ profile }: { profile: ListedProfile }) => {
  const { t } = useLingui();
  const blocked = !profile.enabled || !profile.checkMail;
  let description: string | undefined;

  if (!profile.enabled) {
    description = t({
      message: "Turn on Enabled first.",
      comment:
        "Description of a switch on a disabled profile's page in Settings, which is disabled until Enabled, the page's first switch, is turned on",
    });
  } else if (!profile.checkMail) {
    description = t({
      message: "Turn on Check mail first.",
      comment:
        "Description of Show in Unified inbox on a profile's page in Settings, whose switch is disabled while Check mail, the row above, is off",
    });
  }

  return (
    <Row
      label={t({
        message: "Show in Unified inbox",
        comment:
          "Label of the switch on a profile's page in Settings that lists its unread mail in the Unified inbox, the list of every profile's unread mail",
      })}
      description={description}
      disabled={blocked}
    >
      {(ids) => (
        <Switch
          checked={profile.unifiedInbox}
          disabled={blocked}
          aria-labelledby={ids.label}
          aria-describedby={ids.description || undefined}
          onCheckedChange={(on) => {
            settingsCalls()
              .setUnifiedInbox({ profileId: profile.id, on })
              .catch(noop);
          }}
        />
      )}
    </Row>
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
      aria-describedby={ids.description || undefined}
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
 * A profile's own page inside Profiles: its name, color, mail and sleep, its
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
    blue: t({ message: "Blue", comment: "Name of a profile's color" }),
    orange: t({ message: "Orange", comment: "Name of a profile's color" }),
    green: t({ message: "Green", comment: "Name of a profile's color" }),
    pink: t({ message: "Pink", comment: "Name of a profile's color" }),
    cyan: t({ message: "Cyan", comment: "Name of a profile's color" }),
    lime: t({ message: "Lime", comment: "Name of a profile's color" }),
    amber: t({ message: "Amber", comment: "Name of a profile's color" }),
    violet: t({ message: "Violet", comment: "Name of a profile's color" }),
  };
  // Said until the page is left, as v3's toast was shown once.
  const [deleted, setDeleted] = useState(false);
  const removable = count > 1 && !lastEnabled;
  const many = count > 1;
  const off = !profile.enabled;
  const enableFirst = t({
    message: "Turn on Enabled first.",
    comment:
      "Description of a switch on a disabled profile's page in Settings, which is disabled until Enabled, the page's first switch, is turned on",
  });
  const checkMailDescription = off
    ? enableFirst
    : t({
        message:
          "Shows unread counts and notifies you about new mail for this profile.",
        comment: "Description of Check mail on a profile's page in Settings",
      });
  const stillChecked = profile.checkMail
    ? ` ${t({
        message: "Meru still checks its mail.",
        comment:
          "Second sentence of Sleep's description on a profile's page in Settings, while its Check mail is on",
      })}`
    : "";
  let sleepDescription: string;

  if (off) {
    sleepDescription = enableFirst;
  } else if (lastAwake) {
    sleepDescription = t({
      message: "At least one profile has to stay awake.",
      comment:
        "Description of Sleep on a profile's page in Settings, whose switch is disabled since every other profile sleeps",
    });
  } else {
    sleepDescription = `${t({
      message: "Closes its pages to save memory until you select it again.",
      comment: "Description of Sleep on a profile's page in Settings",
    })}${stillChecked}`;
  }

  const enabledDescription = lastEnabled
    ? t({
        message: "At least one profile has to stay on.",
        comment:
          "Description of Enabled on the page of the only enabled profile in Settings, whose switch is disabled",
      })
    : t({
        message:
          "Turn off to hide this profile and stop checking its mail. You stay signed in.",
        comment: "Description of Enabled on a profile's page in Settings",
      });
  let removeDescription: string;

  if (count === 1) {
    removeDescription = t({
      message: "You can't remove your only profile.",
      comment:
        "Description of Remove profile on the page of the only profile in Settings, whose button is disabled",
    });
  } else if (lastEnabled) {
    removeDescription = t({
      message: "You can't remove the only profile that's turned on.",
      comment:
        "Description of Remove profile on the page of the only enabled profile in Settings, whose button is disabled",
    });
  } else {
    removeDescription = t({
      message:
        "Signs you out and deletes this profile from this computer. Your Google account isn't affected.",
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
              "This profile is disabled. You're still signed in, but Meru isn't checking its mail.",
            comment: "Line at the top of a disabled profile's page in Settings",
          })}
        </p>
      ) : (
        accountShown(profile) && <AccountLine profile={profile} />
      )}
      <SettingGroups>
        <SettingGroup>
          <FieldGroup>
            {many && (
              <>
                <Row
                  label={t({
                    message: "Enabled",
                    comment:
                      "Label of the switch on a profile's page in Settings that turns the profile off or on; off, it leaves the title bar and its mail is not checked",
                  })}
                  description={enabledDescription}
                  disabled={lastEnabled}
                >
                  {(ids) => (
                    <Switch
                      checked={profile.enabled}
                      disabled={lastEnabled}
                      aria-labelledby={ids.label}
                      aria-describedby={ids.description || undefined}
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
                message: "Color",
                comment: "Label of a profile's color on its page in Settings",
              })}
              description={t({
                message:
                  "Meru uses it for the profile dot and to tint the title bar.",
                comment:
                  "Description of a profile's color on its page in Settings; the profile dot is the colored dot that marks the profile",
              })}
            >
              {(ids) => (
                <Select
                  items={PROFILE_COLOR_NAMES.map((name) => ({
                    value: name,
                    label: colorNames[name],
                  }))}
                  value={profile.colorName}
                  onValueChange={(color) => {
                    if (color !== null) {
                      calls
                        .setProfileColor({ profileId: profile.id, color })
                        .catch(noop);
                    }
                  }}
                >
                  <SelectTrigger
                    aria-labelledby={ids.label}
                    aria-describedby={ids.description || undefined}
                    className="min-w-28"
                  >
                    <SelectValue>
                      {(name: ProfileColorName | null) =>
                        name === null ? (
                          t({
                            message: "Choose a color",
                            comment:
                              "Shown in the Color menu on a profile's page in Settings while the profile's stored color is one this version does not know",
                          })
                        ) : (
                          <ColorItem name={name} label={colorNames[name]} />
                        )
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {PROFILE_COLOR_NAMES.map((name) => (
                        <SelectItem key={name} value={name}>
                          <ColorItem name={name} label={colorNames[name]} />
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
                  aria-describedby={ids.description || undefined}
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
                <UnifiedInboxRow profile={profile} />
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
                      aria-describedby={ids.description || undefined}
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
        </SettingGroup>
        <SavedSearchesCard profile={profile} />
        <SettingGroup>
          <FieldGroup>
            <Row
              label={t({
                message: "Browsing data",
                comment:
                  "Label of the row on a profile's page in Settings whose Delete… button deletes its browsing data",
              })}
              description={
                deleted
                  ? t({
                      message: "Browsing data deleted.",
                      comment:
                        "Description of Browsing data on a profile's page in Settings, once its data was deleted",
                    })
                  : t({
                      message:
                        "Deletes cookies, site data and cached files for this profile.",
                      comment:
                        "Description of Browsing data on a profile's page in Settings",
                    })
              }
            >
              {(ids) => (
                <DeleteBrowsingData
                  profileId={profile.id}
                  name={profile.name}
                  describedBy={ids.description}
                  onDeleted={() => {
                    setDeleted(true);
                  }}
                />
              )}
            </Row>
            <FieldSeparator />
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
                  aria-describedby={ids.description || undefined}
                  onClick={() => {
                    onRemoveAsked();
                    calls.removeProfile({ profileId: profile.id }).catch(noop);
                  }}
                >
                  {t({
                    message: "Remove…",
                    comment:
                      "Button of the Remove profile row on a profile's page in Settings that asks to remove the profile",
                  })}
                </Button>
              )}
            </Row>
          </FieldGroup>
        </SettingGroup>
      </SettingGroups>
    </>
  );
};
