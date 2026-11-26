import { noop } from "es-toolkit";
import { useState } from "react";
import type { ReactNode } from "react";

import type { PageOverridableKey } from "#contract/settings.ts";

import { DiffersLine, OverrideCaption, ResetButton } from "./row-scope.tsx";
import type { RowScope } from "./row-scope.tsx";
import { ScopeTabs } from "./scope-tabs.tsx";
import { differingProfiles, isScoped, shownScope } from "./scope.ts";
import type { ListedProfile, PageKeys, Scope } from "./scope.ts";
import { settingsCalls } from "./sync.ts";

/**
 * A page's scope, from the profiles listed and the page's settings a
 * profile may hold a value of its own for: the profile shown, what each of
 * those rows adds in it, and the page wrapped in the switcher while it has
 * scopes.
 */
export const usePageScope = (
  profiles: readonly ListedProfile[] | undefined,
  keys: PageKeys
) => {
  const [chosen, setChosen] = useState<Scope>("all");
  const listed = profiles ?? [];
  const scoped = isScoped(listed, keys);
  const scope = shownScope(chosen, listed, keys);

  // A scope that fell back stays fallen back, even once its profile's id
  // could show again.
  if (profiles && scope !== chosen) {
    setChosen(scope);
  }

  const profile = listed.find((candidate) => candidate.id === scope);

  /**
   * What the row adds in the scope shown, `appValue` naming the app value
   * in a profile's caption; nothing while the page has no scopes.
   */
  const rowScope = (
    key: PageOverridableKey,
    label: string,
    appValue: () => string
  ): RowScope => {
    if (!scoped) {
      return {};
    }

    if (!profile) {
      const differing = differingProfiles(listed, key);

      return differing.length > 0
        ? { line: <DiffersLine differing={differing} onShow={setChosen} /> }
        : {};
    }

    if (!Object.hasOwn(profile.overrides, key)) {
      return {
        line: <OverrideCaption name={profile.name} appValue={undefined} />,
      };
    }

    return {
      line: <OverrideCaption name={profile.name} appValue={appValue()} />,
      reset: (
        <ResetButton
          label={label}
          onClick={() => {
            // Main refuses a profile removed since the page last heard, and
            // the page then shows main's state.
            settingsCalls()
              .clearOverride({ profileId: profile.id, key })
              .catch(noop);
          }}
        />
      ),
      bar: profile.color,
    };
  };

  const page = (cards: ReactNode) =>
    scoped ? (
      <ScopeTabs
        profiles={listed}
        keys={keys}
        scope={scope}
        onScope={setChosen}
      >
        {cards}
      </ScopeTabs>
    ) : (
      cards
    );

  return { profile, rowScope, page };
};
