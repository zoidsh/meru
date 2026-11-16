import { t } from "@lingui/core/macro";

import type { Design, SettingKey, SettingValue } from "#core/settings.ts";
import { adjacentProfile, selectedProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { adjacentTab, canCloseTab, findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";

export type Platform = "darwin" | "win32" | "linux";

/** What a command decides from: main's state and settings as they are now. */
export interface CommandContext {
  state: State;
  setting: <Key extends SettingKey>(key: Key) => SettingValue<Key>;
}

/** What commands do, each through the module that owns it. */
export interface CommandActions {
  /** Sets a setting to what `change` makes of it once earlier changes are in. */
  updateSetting: <Key extends SettingKey>(
    key: Key,
    change: (value: SettingValue<Key>) => SettingValue<Key>
  ) => Promise<void>;
  reloadSelectedTab: () => void;
  selectTab: (key: TabKey) => Promise<unknown>;
  closeTab: (key: TabKey) => Promise<unknown>;
  selectProfile: (profileId: string) => Promise<unknown>;
  addProfile: () => Promise<unknown>;
  /** Opens the overlay with a field for the profile's name. */
  openRenameProfile: (profileId: string) => void;
}

export interface Command {
  id: string;
  /** Called each time the command is shown, so it is in the language of the day. */
  title: () => string;
  /** An Electron accelerator per platform; none where the platform has no key. */
  shortcut?: Partial<Record<Platform, string>>;
  /** Where the command exists; everywhere when not given. */
  platforms?: readonly Platform[];
  isAvailable?: (context: CommandContext) => boolean;
  /** A command with this is a choice that is on or off. */
  isChecked?: (context: CommandContext) => boolean;
  /**
   * Runs once for a held shortcut, since repeating it would close or step
   * through more than the person meant.
   */
  once?: true;
  run: (context: CommandContext, actions: CommandActions) => Promise<unknown>;
}

const selectedTab = (state: State): TabKey => {
  const profile = selectedProfile(state);

  return { profileId: profile.id, tabId: profile.selectedTabId };
};

const chooseDesign = (
  id: string,
  design: Design,
  title: () => string
): Command => ({
  id,
  title,
  isChecked: ({ setting }) => setting("design") === design,
  run: (_context, { updateSetting }) => updateSetting("design", () => design),
});

const selectAdjacentTab = (offset: number): Command["run"] => {
  const run: Command["run"] = async ({ state }, { selectTab }) => {
    const key = adjacentTab(state, offset);

    if (key) {
      await selectTab(key);
    }
  };

  return run;
};

const selectAdjacentProfile = (offset: number): Command["run"] => {
  const run: Command["run"] = async ({ state }, { selectProfile }) => {
    const profileId = adjacentProfile(state, offset);

    if (profileId !== undefined) {
      await selectProfile(profileId);
    }
  };

  return run;
};

const hasOtherTab = ({ state }: CommandContext) =>
  adjacentTab(state, 1) !== undefined;

const hasOtherProfile = ({ state }: CommandContext) =>
  adjacentProfile(state, 1) !== undefined;

/**
 * Every command, declared once. The default shortcuts are v3's where v3 has
 * the command.
 */
export const COMMANDS: readonly Command[] = [
  chooseDesign("design.modern", "modern", () =>
    t({
      message: "Modern",
      context: "design",
      comment:
        "Menu item in the View menu that chooses the design where pages sit inset with rounded corners",
    })
  ),
  chooseDesign("design.classic", "classic", () =>
    t({
      message: "Classic",
      context: "design",
      comment:
        "Menu item in the View menu that chooses the design where pages run edge to edge, as in earlier versions",
    })
  ),
  {
    id: "vibrancy.toggle",
    title: () =>
      t({
        message: "Vibrancy",
        comment:
          "Menu item in the View menu, checked while the window's sidebar and title bar let the desktop show through, blurred, as macOS sidebars do",
      }),
    platforms: ["darwin"],
    isChecked: ({ setting }) => setting("vibrancy"),
    run: (_context, { updateSetting }) =>
      updateSetting("vibrancy", (isOn) => !isOn),
  },
  {
    id: "tab.reload",
    title: () =>
      t({
        message: "Reload",
        comment: "Menu item in the View menu that loads the selected tab again",
      }),
    shortcut: {
      darwin: "CommandOrControl+R",
      win32: "CommandOrControl+R",
      linux: "CommandOrControl+R",
    },
    run: (_context, { reloadSelectedTab }) => {
      reloadSelectedTab();

      return Promise.resolve();
    },
  },
  {
    id: "tab.next",
    title: () =>
      t({
        message: "Select Next Tab",
        comment:
          "Menu item in the Tabs menu that selects the tab below the selected one, or the first after the last",
      }),
    shortcut: { darwin: "Ctrl+Tab", win32: "Ctrl+Tab", linux: "Ctrl+Tab" },
    isAvailable: hasOtherTab,
    once: true,
    run: selectAdjacentTab(1),
  },
  {
    id: "tab.previous",
    title: () =>
      t({
        message: "Select Previous Tab",
        comment:
          "Menu item in the Tabs menu that selects the tab above the selected one, or the last before the first",
      }),
    shortcut: {
      darwin: "Ctrl+Shift+Tab",
      win32: "Ctrl+Shift+Tab",
      linux: "Ctrl+Shift+Tab",
    },
    isAvailable: hasOtherTab,
    once: true,
    run: selectAdjacentTab(-1),
  },
  {
    id: "tab.close",
    title: () =>
      t({
        message: "Close Tab",
        comment: "Menu item in the Tabs menu that closes the selected tab",
      }),
    shortcut: {
      darwin: "CommandOrControl+Shift+W",
      win32: "CommandOrControl+Shift+W",
      linux: "CommandOrControl+Shift+W",
    },
    isAvailable: ({ state }) => {
      const tab = findTab(state, selectedTab(state));

      return tab !== undefined && canCloseTab(tab);
    },
    once: true,
    run: ({ state }, { closeTab }) => closeTab(selectedTab(state)),
  },
  {
    id: "profile.next",
    title: () =>
      t({
        message: "Select Next Profile",
        comment:
          "Menu item in the Window menu that selects the profile right of the selected one, or the first after the last",
      }),
    shortcut: { darwin: "Command+Shift+]" },
    isAvailable: hasOtherProfile,
    once: true,
    run: selectAdjacentProfile(1),
  },
  {
    id: "profile.previous",
    title: () =>
      t({
        message: "Select Previous Profile",
        comment:
          "Menu item in the Window menu that selects the profile left of the selected one, or the last before the first",
      }),
    shortcut: { darwin: "Command+Shift+[" },
    isAvailable: hasOtherProfile,
    once: true,
    run: selectAdjacentProfile(-1),
  },
  {
    id: "profile.add",
    title: () =>
      t({
        message: "Add Profile",
        comment:
          "Menu item in the Window menu that adds a profile, signed in to no account yet, and selects it",
      }),
    once: true,
    run: (_context, { addProfile }) => addProfile(),
  },
  {
    id: "profile.rename",
    title: () =>
      t({
        message: "Rename Profile…",
        comment:
          "Menu item in the Window menu that shows a field to change the selected profile's name",
      }),
    run: ({ state }, { openRenameProfile }) => {
      openRenameProfile(state.selectedProfileId);

      return Promise.resolve();
    },
  },
];

/** The commands that exist on `platform`. */
export const commandsFor = (platform: Platform) =>
  COMMANDS.filter(
    (command) => !command.platforms || command.platforms.includes(platform)
  );
