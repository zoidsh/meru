import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { noop } from "es-toolkit";
import {
  ChevronRightIcon,
  GripVerticalIcon,
  BanIcon,
  MoonIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";

import type { SettingsState } from "#contract/settings.ts";
import { Badge } from "#ui/badge.tsx";
import { Button } from "#ui/button.tsx";
import { Card, CardContent } from "#ui/card.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "#ui/item.tsx";

import { ProBadge } from "./pro-badge.tsx";
import { ProfileDot } from "./scope-tabs.tsx";
import { AccountSummary, accountShown } from "./signed-in.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

type ListedProfile = SettingsState["profiles"][number];

/** A profile whose removal was asked for, at its place in the list then. */
export interface RemovedProfile {
  profileId: string;
  index: number;
}

interface Drop {
  profileId: string;
  before: boolean;
}

/**
 * The profiles in the titlebar's order, each opening its own page, moved by
 * the handle before it; Add profile under them. On the free version the
 * profiles it does not use follow, dimmed with the Meru Pro badge and no
 * page, and Add profile is disabled with the badge.
 */
export const ProfilesPage = ({
  profiles,
  onAdded,
  removed,
  onRemovalSeen,
}: {
  profiles: readonly ListedProfile[];
  /** With the new profile's id, once its page is to show. */
  onAdded: (profileId: string) => void;
  /** Focus goes to the row in its place once it is gone. */
  removed: RemovedProfile | undefined;
  onRemovalSeen: () => void;
}) => {
  const { t } = useLingui();
  const calls = settingsCalls();
  const helpId = useId();
  const rowIds = useId();
  const [announcement, setAnnouncement] = useState("");
  const [dragged, setDragged] = useState<string>();
  const [draggable, setDraggable] = useState<string>();
  const [drop, setDrop] = useState<Drop>();
  const grips = useRef(new Map<string, HTMLButtonElement>());
  const rows = useRef(new Map<string, HTMLButtonElement>());
  // A row moved while its handle has focus is put back in the DOM, which
  // drops the focus.
  const refocus = useRef<{ profileId: string; toIndex: number }>(undefined);
  const many = profiles.length > 1;
  const locked = useSettingsState("lockedProfiles") ?? [];
  const oneProfile =
    useSettingsState("proRequired")?.includes("profiles") ?? false;
  const addId = useId();
  const onlyOne = t({
    message:
      "The free version uses one profile. Upgrade to Meru Pro to use as many as you like, along with everything else Meru Pro adds.",
    comment:
      "Sentence in the popover the Meru Pro badge opens beside a profile the free version does not use, or beside Add profile, in Settings' Profiles section",
  });

  useEffect(() => {
    const moved = refocus.current;

    if (moved && profiles[moved.toIndex]?.id === moved.profileId) {
      grips.current.get(moved.profileId)?.focus();
      refocus.current = undefined;
    }
  }, [profiles]);

  // A confirmed removal shows this list with the focused button gone.
  useEffect(() => {
    if (!removed) {
      return;
    }

    if (!profiles.some((profile) => profile.id === removed.profileId)) {
      const next = profiles[Math.min(removed.index, profiles.length - 1)];

      if (next) {
        rows.current.get(next.id)?.focus();
      }
    }

    onRemovalSeen();
  }, [removed, profiles, onRemovalSeen]);

  const move = (profile: ListedProfile, toIndex: number) => {
    if (
      toIndex < 0 ||
      toIndex >= profiles.length ||
      profiles[toIndex]?.id === profile.id
    ) {
      return;
    }

    const { name } = profile;
    const place = toIndex + 1;
    const count = profiles.length;

    const moved = t({
      message: `${name} is now ${place} of ${count} in the title bar.`,
      comment:
        "Read by screen readers after a profile is moved in Settings' list of profiles; {place} is its new place from 1 and {count} how many profiles there are",
    });

    refocus.current =
      document.activeElement === grips.current.get(profile.id)
        ? { profileId: profile.id, toIndex }
        : undefined;
    calls
      .moveProfile({ profileId: profile.id, toIndex })
      .then(() => setAnnouncement(moved))
      .catch(noop);
  };

  const onGripKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    profile: ListedProfile,
    index: number
  ) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();
    move(profile, index + (event.key === "ArrowUp" ? -1 : 1));
  };

  const endDrag = () => {
    setDragged(undefined);
    setDraggable(undefined);
    setDrop(undefined);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>, profileId: string) => {
    if (dragged === undefined) {
      return;
    }

    event.preventDefault();

    const box = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < box.top + box.height / 2;

    if (drop?.profileId !== profileId || drop.before !== before) {
      setDrop({ profileId, before });
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const from = profiles.findIndex((profile) => profile.id === dragged);
    const target = profiles.findIndex(
      (profile) => profile.id === drop?.profileId
    );
    const profile = profiles[from];

    if (profile && target !== -1 && drop) {
      const to = target + (drop.before ? 0 : 1);

      move(profile, from < to ? to - 1 : to);
    }

    endDrag();
  };

  return (
    <>
      <Card>
        <CardContent>
          <ItemGroup
            aria-label={t({
              message: "Profiles",
              comment:
                "Accessible name of the list of profiles in Settings' Profiles section",
            })}
          >
            {profiles.map((profile, index) => {
              const { name } = profile;
              const titleId = `${rowIds}-${profile.id}-title`;
              const aboutId = `${rowIds}-${profile.id}-about`;
              const badgeId = `${rowIds}-${profile.id}-badge`;
              const shown = accountShown(profile);
              const badged = !profile.enabled || profile.asleep;

              return (
                // The row is where a dragged handle drops, and the handle
                // moves it by keyboard too. Item Group is a `role="list"`
                // div, so the row is no `li`.
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                <div
                  key={profile.id}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                  role="listitem"
                  draggable={draggable === profile.id}
                  onDragStart={(event) => {
                    setDragged(profile.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", profile.id);
                  }}
                  onDragOver={(event) => {
                    onDragOver(event, profile.id);
                  }}
                  onDrop={onDrop}
                  onDragEnd={endDrag}
                  className={cn(
                    "flex items-center gap-1 rounded-lg",
                    dragged === profile.id && "opacity-50",
                    drop?.profileId === profile.id &&
                      (drop.before
                        ? "shadow-[0_-2px_0_var(--foreground)]"
                        : "shadow-[0_2px_0_var(--foreground)]")
                  )}
                >
                  {many && (
                    <Button
                      ref={(element) => {
                        if (element) {
                          grips.current.set(profile.id, element);
                        } else {
                          grips.current.delete(profile.id);
                        }
                      }}
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t({
                        message: `Move ${name}`,
                        comment:
                          "Accessible name of the handle before a profile in Settings' list, which moves it by dragging or the up and down arrows; {name} is the profile's name",
                      })}
                      aria-describedby={helpId}
                      onPointerDown={() => {
                        setDraggable(profile.id);
                      }}
                      // A press that never becomes a drag would otherwise
                      // leave the whole row draggable.
                      onPointerUp={() => {
                        setDraggable(undefined);
                      }}
                      onKeyDown={(event) => {
                        onGripKey(event, profile, index);
                      }}
                      className="cursor-grab text-muted-foreground"
                    >
                      <GripVerticalIcon />
                    </Button>
                  )}
                  {/* Item fills on hover only as a link, so the row asks for it here. */}
                  <Item
                    size="sm"
                    render={
                      // Named by the profile's name inside it.
                      // oxlint-disable-next-line jsx-a11y/control-has-associated-label
                      <button
                        type="button"
                        ref={(element) => {
                          if (element) {
                            rows.current.set(profile.id, element);
                          } else {
                            rows.current.delete(profile.id);
                          }
                        }}
                      />
                    }
                    onClick={() => {
                      void calls.openPage({
                        section: "profiles",
                        profileId: profile.id,
                      });
                    }}
                    // Named by the profile alone, so its address and badge
                    // are read after it rather than as its name.
                    aria-labelledby={titleId}
                    aria-describedby={
                      [shown && aboutId, badged && badgeId]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    className="min-w-0 flex-1 text-left hover:bg-muted"
                  >
                    {/* Dimmed while disabled, as v3 drew a disabled account. */}
                    <ItemMedia className={cn(!profile.enabled && "opacity-60")}>
                      <ProfileDot color={profile.color} />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle
                        id={titleId}
                        className={cn(
                          "max-w-full",
                          !profile.enabled && "opacity-60"
                        )}
                      >
                        {profile.name}
                      </ItemTitle>
                      {shown && (
                        <ItemDescription id={aboutId}>
                          <span className="flex items-center gap-1.5">
                            <AccountSummary profile={profile} />
                          </span>
                        </ItemDescription>
                      )}
                    </ItemContent>
                    <ItemActions className="text-muted-foreground">
                      {!profile.enabled && (
                        <Badge id={badgeId} variant="outline">
                          <BanIcon data-icon="inline-start" />
                          {t({
                            message: "Disabled",
                            comment:
                              "Badge on a disabled profile's row in Settings' list of profiles, one turned off by its Enabled switch",
                          })}
                        </Badge>
                      )}
                      {profile.enabled && profile.asleep && (
                        <Badge id={badgeId} variant="outline">
                          <MoonIcon data-icon="inline-start" />
                          {t({
                            message: "Asleep",
                            comment:
                              "Badge on a sleeping profile's row in Settings' list of profiles",
                          })}
                        </Badge>
                      )}
                      <ChevronRightIcon aria-hidden className="size-4" />
                    </ItemActions>
                  </Item>
                </div>
              );
            })}
            {locked.map((profile) => {
              const titleId = `${rowIds}-${profile.id}-title`;

              return (
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Item Group is a `role="list"` div
                <div key={profile.id} role="listitem" className="flex">
                  <Item size="sm" className="min-w-0 flex-1">
                    <ItemMedia className="opacity-60">
                      <ProfileDot color={profile.color} />
                    </ItemMedia>
                    <ItemContent className="min-w-0 opacity-60">
                      <ItemTitle id={titleId} className="max-w-full">
                        {profile.name}
                      </ItemTitle>
                      <ItemDescription>
                        {t({
                          message: "You need Meru Pro to use this profile.",
                          comment:
                            "Line under a profile in Settings' list of profiles on the free version, which uses the first profile alone",
                        })}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <ProBadge labelledBy={titleId} description={onlyOne} />
                    </ItemActions>
                  </Item>
                </div>
              );
            })}
          </ItemGroup>
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <Button
          id={addId}
          variant="outline"
          size="sm"
          disabled={oneProfile}
          onClick={() => {
            calls.addProfile({}).then(onAdded).catch(noop);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          {t({
            message: "Add profile",
            comment:
              "Button under Settings' list of profiles that adds one and opens its page",
          })}
        </Button>
        {oneProfile && <ProBadge labelledBy={addId} description={onlyOne} />}
      </div>
      {many && (
        <p id={helpId} className="px-1 text-sm text-muted-foreground">
          {t({
            message: "Drag to reorder.",
            comment:
              "Line under Settings' list of profiles, in the title bar's order; each row has a handle to drag, which the up and down arrow keys also move",
          })}
        </p>
      )}
      <output className="sr-only">{announcement}</output>
    </>
  );
};
