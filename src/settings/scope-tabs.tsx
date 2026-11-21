import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "#ui/dropdown-menu.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#ui/tabs.tsx";

import { foldsIntoMenu, overrideCount } from "./scope.ts";
import type { ListedProfile, Scope } from "./scope.ts";

/** The folded trigger's value while All profiles is chosen, which it never selects. */
const CHOOSE = "choose";

export const ProfileDot = ({
  color,
  className = "size-2",
}: {
  color: string;
  className?: string;
}) => (
  <span
    aria-hidden
    data-icon="inline-start"
    className={`${className} shrink-0 rounded-full`}
    style={{ background: color }}
  />
);

/**
 * The scope switcher over the page's cards: All profiles, then a segment per
 * profile, folded into one menu beside All profiles whenever the segments
 * laid out whole need more than the content's width.
 */
export const ScopeTabs = ({
  profiles,
  scope,
  onScope,
  children,
}: {
  profiles: readonly ListedProfile[];
  scope: Scope;
  onScope: (scope: Scope) => void;
  children: ReactNode;
}) => {
  const { t } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;

    if (!root || !measure) {
      return;
    }

    const check = () => {
      setFolded(foldsIntoMenu(measure.offsetWidth, root.clientWidth));
    };
    const observer = new ResizeObserver(check);

    check();
    observer.observe(root);
    observer.observe(measure);

    return () => {
      observer.disconnect();
    };
  }, []);

  const allProfiles = t({
    message: "All profiles",
    comment:
      "First segment of the scope switcher atop a Settings page: the app setting every profile uses unless it sets its own",
  });
  const chosen = profiles.find((profile) => profile.id === scope);
  const chosenName = chosen?.name;
  const segments = profiles.map((profile) => (
    <TabsTrigger key={profile.id} value={profile.id}>
      <ProfileDot color={profile.color} />
      {profile.name}
    </TabsTrigger>
  ));

  return (
    <div ref={rootRef} className="relative">
      {/* The segments laid out whole, unseen, to measure against the room. */}
      <div
        ref={measureRef}
        aria-hidden
        inert
        className="invisible absolute top-0 left-0 w-max"
      >
        <Tabs value="all">
          <TabsList>
            <TabsTrigger value="all">{allProfiles}</TabsTrigger>
            {segments}
          </TabsList>
        </Tabs>
      </div>
      <Tabs
        value={scope}
        onValueChange={(value: Scope) => {
          if (value !== CHOOSE) {
            onScope(value);
          }
        }}
        className="gap-4"
      >
        <div className="flex flex-col gap-2">
          <TabsList
            aria-label={t({
              message: "Scope",
              comment:
                "Accessible name of the switcher atop a Settings page choosing whether it edits every profile's setting or one profile's own",
            })}
          >
            <TabsTrigger value="all">{allProfiles}</TabsTrigger>
            {folded ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<TabsTrigger value={chosen?.id ?? CHOOSE} />}
                >
                  {chosen ? (
                    <>
                      <ProfileDot color={chosen.color} />
                      {chosen.name}
                    </>
                  ) : (
                    t({
                      message: "Choose a profile",
                      comment:
                        "Segment of the Settings scope switcher that opens the list of profiles when their names do not fit",
                    })
                  )}
                  <ChevronDownIcon data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-auto min-w-55"
                  aria-label={t({
                    message: "Profiles",
                    comment:
                      "Accessible name of the menu of profiles in the Settings scope switcher",
                  })}
                >
                  <DropdownMenuRadioGroup
                    value={chosen?.id ?? null}
                    onValueChange={(value: string) => {
                      onScope(value);
                    }}
                  >
                    {profiles.map((profile) => {
                      const count = overrideCount(profile);

                      return (
                        <DropdownMenuRadioItem
                          key={profile.id}
                          value={profile.id}
                        >
                          <ProfileDot color={profile.color} />
                          <span className="truncate">{profile.name}</span>
                          {count > 0 && (
                            <span className="ml-auto shrink-0 pl-4 text-muted-foreground">
                              {t({
                                message: plural(count, {
                                  one: "# override",
                                  other: "# overrides",
                                }),
                                comment:
                                  "How many settings a profile sets for itself, beside its name in the Settings scope switcher's menu",
                              })}
                            </span>
                          )}
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              segments
            )}
          </TabsList>
          <p className="text-sm text-muted-foreground">
            {chosenName === undefined
              ? t({
                  message: "Every profile uses these, unless it sets its own.",
                  comment:
                    "Line under the Settings scope switcher while All profiles is chosen",
                })
              : t({
                  message: `Changes here apply to ${chosenName} alone.`,
                  comment:
                    "Line under the Settings scope switcher while one profile's scope is chosen; {chosenName} is the profile's name",
                })}
          </p>
        </div>
        <TabsContent value={scope} className="flex flex-col gap-4">
          {children}
        </TabsContent>
      </Tabs>
    </div>
  );
};
