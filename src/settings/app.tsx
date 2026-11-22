import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { TITLEBAR_HEIGHT } from "#core/layout.ts";
import type { SettingsSection } from "#core/settings-pages.ts";
import { Button } from "#ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#ui/input-group.tsx";

import { NotificationsPage } from "./notifications-page.tsx";
import { ProfilePage } from "./profile-page.tsx";
import { ProfilesPage } from "./profiles-page.tsx";
import type { RemovedProfile } from "./profiles-page.tsx";
import { settingsCalls, useSettingsState } from "./sync.ts";

/** The nav's width, which the titlebar's buttons start after. */
const NAV_WIDTH = 212;

interface Section {
  id: SettingsSection;
  icon: LucideIcon;
  /** The tile's colour behind the icon. */
  tile: string;
}

/** The sections built so far, in the nav's groups. */
const SECTION_GROUPS: readonly (readonly Section[])[] = [
  [{ id: "profiles", icon: UsersIcon, tile: "bg-[oklch(0.58_0.17_255)]" }],
  [{ id: "notifications", icon: BellIcon, tile: "bg-[oklch(0.62_0.2_25)]" }],
];

export const App = () => {
  const { t } = useLingui();
  const page = useSettingsState("page");
  const profiles = useSettingsState("profiles");
  // The profile just added, whose name is focused once its page shows.
  const [added, setAdded] = useState<string>();
  const nameFocused = useCallback(() => {
    setAdded(undefined);
  }, []);
  // The profile whose removal was asked for and its place, so the list
  // shown once it is gone puts focus on the row in its place.
  const [removing, setRemoving] = useState<RemovedProfile>();
  const removalSeen = useCallback(() => {
    setRemoving(undefined);
  }, []);
  const [query, setQuery] = useState("");

  const titles: Record<SettingsSection, string> = {
    profiles: t({
      message: "Profiles",
      comment:
        "Name of the Settings section listing the profiles, in its list and as its title",
    }),
    notifications: t({
      message: "Notifications",
      comment:
        "Name of the Settings section for notifications, the unread badge and Do Not Disturb, in its list and as its title",
    }),
  };
  const sectionId = page?.section ?? "notifications";
  const profile =
    sectionId === "profiles" && page?.profileId
      ? profiles?.find((candidate) => candidate.id === page.profileId)
      : undefined;
  const title = profile?.name ?? titles[sectionId];
  const needle = query.trim().toLocaleLowerCase();
  const shown = SECTION_GROUPS.map((group) =>
    group.filter((section) =>
      titles[section.id].toLocaleLowerCase().includes(needle)
    )
  ).filter((group) => group.length > 0);

  const settingsTitle = t({
    message: "Settings",
    comment: "Title of the Settings window",
  });

  useEffect(() => {
    document.title = settingsTitle;
  }, [settingsTitle]);

  const calls = settingsCalls();

  return (
    <div className="flex h-screen flex-col bg-shell text-foreground select-none">
      <header
        aria-label={t({
          message: "Title bar",
          comment:
            "Accessible name of the strip across the top of the Settings window, read by screen readers",
        })}
        style={{ height: TITLEBAR_HEIGHT, paddingLeft: NAV_WIDTH }}
        className="flex shrink-0 items-center gap-1 [app-region:drag]"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({
            message: "Back",
            comment:
              "Accessible name of the Settings window's button that goes back to the page shown before, a section or a profile's page",
          })}
          title={t({
            message: "Back",
            comment:
              "Tooltip of the Settings window's button that goes back to the page shown before, a section or a profile's page",
          })}
          disabled={!page?.canGoBack}
          onClick={() => {
            void calls.goBack({});
          }}
          className="[app-region:no-drag]"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({
            message: "Forward",
            comment:
              "Accessible name of the Settings window's button that goes forward to the page shown after, a section or a profile's page",
          })}
          title={t({
            message: "Forward",
            comment:
              "Tooltip of the Settings window's button that goes forward to the page shown after, a section or a profile's page",
          })}
          disabled={!page?.canGoForward}
          onClick={() => {
            void calls.goForward({});
          }}
          className="[app-region:no-drag]"
        >
          <ChevronRightIcon />
        </Button>
        <h1 className="ml-1 truncate text-sm font-semibold">{title}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={t({
            message: "Settings sections",
            comment:
              "Accessible name of the list of sections down the left of the Settings window",
          })}
          style={{ width: NAV_WIDTH }}
          className="flex shrink-0 flex-col gap-3 overflow-y-auto px-3 pb-3"
        >
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              placeholder={t({
                message: "Search",
                comment:
                  "Placeholder of the field atop the Settings window's sections that filters them by name",
              })}
              aria-label={t({
                message: "Search settings",
                comment:
                  "Accessible name of the field atop the Settings window's sections that filters them by name",
              })}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </InputGroup>
          {shown.length > 0 ? (
            shown.map((group) => (
              <div key={group[0]?.id} className="flex flex-col gap-1">
                {group.map(({ id, icon: Icon, tile }) => (
                  <Button
                    key={id}
                    variant={id === sectionId ? "secondary" : "ghost"}
                    size="sm"
                    aria-current={id === sectionId ? "page" : undefined}
                    onClick={() => {
                      void calls.openPage({ section: id, profileId: null });
                    }}
                    className="w-full justify-start gap-2 pl-1"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md text-white",
                        tile
                      )}
                    >
                      <Icon className="size-3.25" strokeWidth={2.25} />
                    </span>
                    {titles[id]}
                  </Button>
                ))}
              </div>
            ))
          ) : (
            <p className="px-2 py-1 text-[0.8rem] text-muted-foreground">
              {t({
                message: "No results",
                comment:
                  "Shown in place of the Settings window's sections when none matches the search",
              })}
            </p>
          )}
        </nav>
        <main aria-label={title} className="flex min-w-0 flex-1 pr-2 pb-2">
          <div
            key={`${sectionId}/${profile?.id ?? ""}`}
            className="min-w-0 flex-1 overflow-y-auto rounded-lg bg-background p-6 select-text"
          >
            <div className="flex flex-col gap-4">
              {sectionId === "notifications" && <NotificationsPage />}
              {sectionId === "profiles" &&
                profiles &&
                (profile ? (
                  <ProfilePage
                    profile={profile}
                    count={profiles.length}
                    lastAwake={
                      !profile.asleep &&
                      profiles.filter((listed) => !listed.asleep).length === 1
                    }
                    focusName={added === profile.id}
                    onNameFocused={nameFocused}
                    onRemoveAsked={() => {
                      setRemoving({
                        profileId: profile.id,
                        index: profiles.indexOf(profile),
                      });
                    }}
                  />
                ) : (
                  <ProfilesPage
                    profiles={profiles}
                    onAdded={setAdded}
                    removed={removing}
                    onRemovalSeen={removalSeen}
                  />
                ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
