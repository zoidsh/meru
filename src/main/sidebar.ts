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
  /** Show windows in the sidebar, as it is now, and each change of it. */
  showWindows: {
    get: () => boolean;
    onChange: (listener: () => void) => void;
  };
}

/**
 * The window's sidebar: the rule over the selected profile's tabs it lists,
 * with the choices made by hand, held in memory until those tabs change.
 * Listeners hear each change of the state it comes to.
 */
export const createSidebar = ({ profiles, showWindows }: SidebarDeps) => {
  let override: SidebarOverride = {};
  let previous = profiles.get();
  let shows = showWindows.get();
  const listeners = new Set<() => void>();

  const current = (): SidebarState =>
    sidebarState(sidebarTabs(profiles.get(), shows), override);

  const change = (next: SidebarOverride, before: SidebarState) => {
    override = next;

    if (current() !== before) {
      for (const listener of listeners) {
        listener();
      }
    }
  };

  profiles.onChange((next) => {
    const before = sidebarState(sidebarTabs(previous, shows), override);
    const kept = keepsOverride(previous, next, shows);

    previous = next;
    change(kept ? override : {}, before);
  });
  showWindows.onChange(() => {
    const before = current();

    shows = showWindows.get();
    change(override, before);
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
