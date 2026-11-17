import {
  keepsOverride,
  sidebarState,
  sidebarTabs,
  toggleShown,
  toggleWidth,
} from "#core/sidebar.ts";
import type { SidebarOverride, SidebarState } from "#core/sidebar.ts";
import type { State } from "#core/state.ts";

export interface SidebarDeps {
  profiles: {
    get: () => State;
    onChange: (listener: (state: State) => void) => void;
  };
}

/**
 * The window's sidebar: the rule over the selected profile's tabs, with the
 * choices made by hand, held in memory until those tabs change. Listeners
 * hear each change of the state it comes to.
 */
export const createSidebar = ({ profiles }: SidebarDeps) => {
  let override: SidebarOverride = {};
  let previous = profiles.get();
  const listeners = new Set<() => void>();

  const current = (): SidebarState =>
    sidebarState(sidebarTabs(profiles.get()), override);

  const change = (next: SidebarOverride, before: SidebarState) => {
    override = next;

    if (current() !== before) {
      for (const listener of listeners) {
        listener();
      }
    }
  };

  profiles.onChange((next) => {
    const before = sidebarState(sidebarTabs(previous), override);
    const kept = keepsOverride(previous, next);

    previous = next;
    change(kept ? override : {}, before);
  });

  return {
    current,
    toggleShown: () => {
      const before = current();

      change(toggleShown(before, override), before);
    },
    toggleWidth: () => {
      const before = current();

      change(toggleWidth(before, override), before);
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type Sidebar = ReturnType<typeof createSidebar>;
