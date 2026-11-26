import { describe, expect, it, onTestFinished } from "vitest";

import { matchesAccelerator } from "#core/accelerator.ts";
import type { Capability } from "#core/entitlement.ts";
import { savedSearches } from "#core/saved-searches.ts";
import { gmailTab, isAsleep, isTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Navigation } from "#platform/content-view.ts";

import {
  COMMANDS,
  currentSearch,
  isCommandAvailable,
  NO_PAGE,
  savedSearchCommands,
} from "./commands.ts";
import type { Command, CommandActions, CommandContext } from "./commands.ts";
import { createDoNotDisturb } from "./do-not-disturb.ts";
import { createProfiles } from "./profiles.ts";

const twoProfiles: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "Week" }],
    },
    newProfile("b", "Profile 2"),
  ],
  selectedProfileId: "a",
};

const commandOf = (id: string) =>
  COMMANDS.find((candidate) => candidate.id === id) as Command;

/** The real profiles, saving nowhere, behind the actions. */
const setup = (initial: State = twoProfiles) => {
  const profiles = createProfiles({
    initial,
    save: () => Promise.resolve(),
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: () => 0,
    log: () => false,
  });
  // 17 November 2026, 14:00 by the local clock.
  const doNotDisturb = createDoNotDisturb({
    profiles,
    now: () => new Date(2026, 10, 17, 14),
    log: () => false,
  });
  let reloads = 0;
  let inboxOpen = false;
  let openAppOpen = false;
  const navigations: string[] = [];
  let sidebarShown = false;
  let navigation: Navigation | null = null;
  let selectedTabAsleep = false;
  let ownWindow: TabKey | undefined;
  const refused = new Set<Capability>();
  let settingsFocused = false;
  let settingsHistory = { canGoBack: false, canGoForward: false };
  const moves: string[] = [];
  const sleeps: string[] = [];
  const splits: string[] = [];
  const finds: string[] = [];
  let findable = false;
  let canFindAgain = false;
  let bookmarked: boolean | undefined;
  const bookmarkToggles: string[] = [];
  let settingsOpened = 0;
  let canUpdate = true;
  let updateChecks = 0;
  const actions: CommandActions = {
    openSettings: () => {
      settingsOpened += 1;
    },
    checkForUpdates: () => {
      updateChecks += 1;
    },
    toggleBookmark: (key, announce) => {
      bookmarkToggles.push(`${key.tabId}${announce ? " announced" : ""}`);
      bookmarked = bookmarked === undefined ? undefined : !bookmarked;

      return Promise.resolve();
    },
    toggleSidebar: () => {
      sidebarShown = !sidebarShown;
    },
    reloadSelectedTab: () => {
      reloads += 1;
    },
    goBack: () => {
      moves.push("back");
    },
    goForward: () => {
      moves.push("forward");
    },
    stopLoading: () => {
      moves.push("stop");
    },
    selectTab: async (key) => {
      selectedTabAsleep = false;
      await profiles.selectTab(key);
    },
    sleepTab: (key) => {
      sleeps.push(`${key.profileId}/${key.tabId}`);
      selectedTabAsleep = true;
    },
    closeTab: profiles.closeTab,
    setTabPinned: profiles.setPinned,
    setTabOpenAtLaunch: profiles.setOpenAtLaunch,
    selectProfile: profiles.select,
    sleepProfile: profiles.sleep,
    setInboxOpen: (open) => {
      inboxOpen = open;
    },
    setOpenAppOpen: (open) => {
      openAppOpen = open;
    },
    openSplit: (direction) => {
      splits.push(direction);
    },
    separateTab: profiles.separateTab,
    maximizePane: profiles.maximizePane,
    switchDoNotDisturb: (choice) =>
      choice === "off"
        ? doNotDisturb.switchOff()
        : doNotDisturb.switchOn(choice),
    navigateGmail: (profileId, hash) => {
      navigations.push(`${profileId} ${hash}`);

      return Promise.resolve();
    },
    addSavedSearch: profiles.addSavedSearch,
    removeSavedSearch: profiles.removeSavedSearch,
    openFind: (key) => {
      finds.push(`open${key ? ` ${key.tabId}` : ""}`);
    },
    findAgain: (forward, key) => {
      finds.push(
        `${forward ? "next" : "previous"}${key ? ` ${key.tabId}` : ""}`
      );
    },
    moveToOwnWindow: async (key) => {
      await profiles.moveToOwnWindow(key);
    },
    moveToMainWindow: async (key) => {
      await profiles.moveToMainWindow(key, true);
    },
    setDownloadsOpen: () => {},
  };
  const context = (): CommandContext => {
    const base = {
      state: profiles.get(),
      ownWindow: settingsFocused ? undefined : ownWindow,
      settingsFocused,
      settingsHistory: settingsFocused ? settingsHistory : undefined,
      doNotDisturb: doNotDisturb.current(),
      can: (capability: Capability) => !refused.has(capability),
      canUpdate,
      inboxOpen,
      downloadsOpen: false,
      openAppOpen,
      sidebarShown,
    };

    return settingsFocused
      ? { ...base, ...NO_PAGE }
      : {
          ...base,
          navigation,
          selectedTabAsleep,
          findable,
          canFindAgain,
          bookmarked,
        };
  };

  onTestFinished(doNotDisturb.dispose);

  return {
    profiles,
    /** As the free version's entitlement refuses it. */
    refuse: (capability: Capability) => {
      refused.add(capability);
    },
    reloads: () => reloads,
    moves,
    sleeps,
    splits,
    finds,
    setFind: (page: boolean, again: boolean) => {
      findable = page;
      canFindAgain = again;
    },
    setNavigation: (next: Navigation | null) => {
      navigation = next;
    },
    setOwnWindow: (key: TabKey | undefined) => {
      ownWindow = key;
    },
    setSettingsFocused: (next: boolean) => {
      settingsFocused = next;
    },
    setSettingsHistory: (next: typeof settingsHistory) => {
      settingsHistory = next;
    },
    setBookmarked: (next: boolean | undefined) => {
      bookmarked = next;
    },
    bookmarkToggles,
    navigations,
    openAppOpen: () => openAppOpen,
    settingsOpened: () => settingsOpened,
    updateChecks: () => updateChecks,
    setCanUpdate: (next: boolean) => {
      canUpdate = next;
    },
    context,
    actions,
    isAvailable: (id: string) => isCommandAvailable(commandOf(id), context()),
    isChecked: (id: string) => commandOf(id).isChecked?.(context()),
    run: (id: string) => commandOf(id).run(context(), actions),
  };
};

const selected = (state: State) => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === state.selectedProfileId
  );

  return [state.selectedProfileId, profile?.selectedTabId];
};

describe("the command registry", () => {
  it("gives every command an id of its own and a title", () => {
    const ids = COMMANDS.map((command) => command.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const command of COMMANDS) {
      expect(command.title()).not.toBe("");
    }
  });

  it("shows or hides the sidebar on Ctrl+Cmd+L, or Ctrl+Alt+D, checked while it shows", async () => {
    const app = setup();

    expect(app.isChecked("sidebar.toggle")).toBeFalsy();

    await app.run("sidebar.toggle");

    expect(app.isChecked("sidebar.toggle")).toBeTruthy();
    expect(commandOf("sidebar.toggle").shortcut).toStrictEqual({
      darwin: "Control+Command+L",
      win32: "Control+Alt+D",
      linux: "Control+Alt+D",
    });
  });

  it.each(["darwin", "win32", "linux"] as const)(
    "leaves Cmd or Ctrl+S to the page on %s, where Google's apps save with it",
    (platform) => {
      const isMacOS = platform === "darwin";
      const save = {
        type: "keyDown",
        key: "s",
        code: "KeyS",
        control: !isMacOS,
        shift: false,
        alt: false,
        meta: isMacOS,
        isAutoRepeat: false,
      };

      expect(
        COMMANDS.filter(({ shortcut }) => {
          const accelerator = shortcut?.[platform];

          return (
            accelerator !== undefined &&
            matchesAccelerator(accelerator, save, isMacOS)
          );
        }).map(({ id }) => id)
      ).toStrictEqual([]);
    }
  );

  it("closes the selected tab, but never a pinned one", async () => {
    const app = setup();

    expect(app.isAvailable("tab.close")).toBeFalsy();

    await app.run("tab.close");
    await app.run("tab.next");

    expect(app.isAvailable("tab.close")).toBeTruthy();

    await app.run("tab.close");

    expect(app.profiles.get().profiles[0]?.tabs).toStrictEqual([gmailTab()]);
  });

  it("moves the selected tab to a window of its own, never a pinned one, and back from that window, selected", async () => {
    const app = setup();
    const calendar = { profileId: "a", tabId: "c1" };
    const offered = [app.isAvailable("tab.moveToNewWindow")];

    await app.run("tab.next");
    offered.push(app.isAvailable("tab.moveToNewWindow"));
    await app.run("tab.moveToNewWindow");
    const away = [
      app.profiles.get().profiles[0]?.tabs.filter(isTab)[1]?.ownWindow,
      selected(app.profiles.get()),
      app.isAvailable("tab.moveToMainWindow"),
    ];

    app.setOwnWindow(calendar);
    offered.push(app.isAvailable("tab.moveToMainWindow"));
    await app.run("tab.moveToMainWindow");

    expect([
      offered,
      away,
      app.profiles.get().profiles[0]?.tabs.filter(isTab)[1]?.ownWindow,
      selected(app.profiles.get()),
    ]).toStrictEqual([
      [false, true, true],
      [true, ["a", "gmail"], false],
      undefined,
      ["a", "c1"],
    ]);
  });

  it("while a tab's own window has focus offers only what acts on its page, and closes that tab", async () => {
    const app = setup();
    const calendar = { profileId: "a", tabId: "c1" };

    await app.profiles.moveToOwnWindow(calendar);
    app.setOwnWindow(calendar);
    app.setNavigation({ canGoBack: true, canGoForward: false, loading: false });

    const offered = [
      "tab.back",
      "tab.reload",
      "tab.close",
      "doNotDisturb.toggle",
      "tab.next",
      "tab.splitRight",
      "tab.moveToNewWindow",
      "sidebar.toggle",
    ].map((id) => [id, Boolean(app.isAvailable(id))]);

    await app.run("tab.close");

    expect([
      offered,
      app.profiles
        .get()
        .profiles[0]?.tabs.filter(isTab)
        .map((each) => each.id),
    ]).toStrictEqual([
      [
        ["tab.back", true],
        ["tab.reload", true],
        ["tab.close", true],
        ["doNotDisturb.toggle", true],
        ["tab.next", false],
        ["tab.splitRight", false],
        ["tab.moveToNewWindow", false],
        ["sidebar.toggle", false],
      ],
      ["gmail"],
    ]);
  });

  it("pins and unpins the selected tab, labelled as it reads, leaving Open at Launch as it was", async () => {
    const app = setup();
    const label = () => commandOf("tab.pin").label?.(app.context());
    const gmail = () => app.profiles.get().profiles[0]?.tabs[0];

    expect([label(), app.isAvailable("tab.close")]).toStrictEqual([
      "Unpin Tab",
      false,
    ]);

    await app.run("tab.pin");

    expect([label(), app.isAvailable("tab.close"), gmail()]).toStrictEqual([
      "Pin Tab",
      true,
      { ...gmailTab(), pinned: false },
    ]);
    expect(app.isAvailable("tab.openAtLaunch")).toBeFalsy();

    await app.run("tab.close");
    await app.run("tab.close");

    expect([
      app.profiles.get().profiles[0]?.tabs,
      app.isAvailable("tab.close"),
      app.isAvailable("tab.pin"),
    ]).toStrictEqual([[], false, false]);
  });

  it("switches Open at Launch for a pinned tab, checked while it is on", async () => {
    const app = setup();

    expect([
      app.isAvailable("tab.openAtLaunch"),
      app.isChecked("tab.openAtLaunch"),
    ]).toStrictEqual([true, true]);

    await app.run("tab.openAtLaunch");

    expect([
      app.isChecked("tab.openAtLaunch"),
      app.profiles.get().profiles[0]?.tabs[0],
    ]).toStrictEqual([false, { ...gmailTab(), openAtLaunch: false }]);

    await app.run("tab.next");

    expect([
      app.isAvailable("tab.openAtLaunch"),
      app.isChecked("tab.openAtLaunch"),
    ]).toStrictEqual([false, false]);
  });

  it("selects the next and previous tab and profile, wrapping round", async () => {
    const app = setup();

    await app.run("tab.next");
    expect(selected(app.profiles.get())).toStrictEqual(["a", "c1"]);
    await app.run("tab.next");
    expect(selected(app.profiles.get())).toStrictEqual(["a", "gmail"]);
    await app.run("tab.previous");
    expect(selected(app.profiles.get())).toStrictEqual(["a", "c1"]);

    await app.run("profile.previous");
    expect(app.profiles.get().selectedProfileId).toBe("b");
    await app.run("profile.next");
    expect(app.profiles.get().selectedProfileId).toBe("a");
  });

  it("skips a profile turned off by place, next and previous, and counts only those on for the inbox", async () => {
    const app = setup({
      ...twoProfiles,
      profiles: [...twoProfiles.profiles, newProfile("c", "Profile 3")],
    });

    await app.profiles.setEnabled("b", false);

    const shortcuts = [
      app.isAvailable("profile.select.2"),
      app.isAvailable("profile.select.3"),
      app.isAvailable("inbox.toggle"),
    ];

    await app.run("profile.select.2");

    const byPlace = app.profiles.get().selectedProfileId;

    await app.run("profile.previous");

    const previous = app.profiles.get().selectedProfileId;

    await app.profiles.setEnabled("c", false);

    expect([
      shortcuts,
      byPlace,
      previous,
      app.isAvailable("inbox.toggle"),
      app.isAvailable("profile.next"),
    ]).toStrictEqual([[true, false, true], "c", "a", false, false]);
  });

  it("puts the selected profile to sleep, which selects the first awake one, and is disabled for the last awake one, with no shortcut", async () => {
    const app = setup();
    const asleep = () => {
      const state = app.profiles.get();

      return state.profiles
        .filter((profile) => isAsleep(state, profile))
        .map((profile) => profile.id);
    };

    expect(app.isAvailable("profile.sleep")).toBeTruthy();

    await app.run("profile.sleep");

    expect([
      asleep(),
      app.profiles.get().selectedProfileId,
      app.isAvailable("profile.sleep"),
    ]).toStrictEqual([["a"], "b", false]);
    expect(commandOf("profile.sleep").shortcut).toBeUndefined();
  });

  it("steps onto a sleeping profile with next, previous or its place, waking it", async () => {
    // Each its own app, so they may run side by side.
    const after = await Promise.all(
      ["profile.next", "profile.previous", "profile.select.2"].map(
        async (id) => {
          const app = setup();

          await app.profiles.sleep("b");
          await app.run(id);

          return [
            app.profiles.get().selectedProfileId,
            app.profiles
              .get()
              .profiles.filter((profile) => profile.asleep !== undefined)
              .length,
          ];
        }
      )
    );

    expect(after).toStrictEqual([
      ["b", 0],
      ["b", 0],
      ["b", 0],
    ]);
  });

  it("offers the next tab or profile only when there is another", async () => {
    const app = setup({
      version: 1,
      profiles: [newProfile("a", "Default")],
      selectedProfileId: "a",
    });

    for (const id of [
      "tab.next",
      "tab.previous",
      "profile.next",
      "profile.previous",
    ]) {
      expect(app.isAvailable(id)).toBeFalsy();
    }

    await app.profiles.add();

    expect(app.profiles.get().profiles).toHaveLength(2);
    expect(app.isAvailable("profile.next")).toBeTruthy();
  });

  it("opens New tab, and closes it when run again", async () => {
    const app = setup();

    await app.run("app.open");

    const opened = app.openAppOpen();

    await app.run("app.open");

    expect([
      app.isAvailable("app.open"),
      opened,
      app.openAppOpen(),
    ]).toStrictEqual([true, true, false]);
  });

  it("bookmarks the selected tab's page, announced, and its own window's, not, only while it can be bookmarked", async () => {
    const app = setup();
    const label = () => commandOf("tab.bookmark").label?.(app.context());
    const unavailable = [app.isAvailable("tab.bookmark"), label()];

    app.setBookmarked(false);

    const offered = [app.isAvailable("tab.bookmark"), label()];

    await app.run("tab.bookmark");

    const bookmarked = label();

    app.setOwnWindow({ profileId: "a", tabId: "c1" });
    await app.run("tab.bookmark");

    expect([
      unavailable,
      offered,
      bookmarked,
      app.isAvailable("tab.bookmark"),
      app.bookmarkToggles,
    ]).toStrictEqual([
      [false, "Bookmark Tab"],
      [true, "Bookmark Tab"],
      "Remove Bookmark",
      true,
      ["gmail announced", "c1"],
    ]);
  });

  it("while Settings has focus offers nothing that acts on a tab or the main window, so the front tab stays where it was", () => {
    const app = setup();

    app.setNavigation({ canGoBack: true, canGoForward: true, loading: true });
    app.setFind(true, true);
    app.setBookmarked(false);
    app.setSettingsFocused(true);

    expect(
      [
        "tab.back",
        "tab.forward",
        "tab.reload",
        "tab.stop",
        "tab.find",
        "tab.findNext",
        "tab.findPrevious",
        "tab.bookmark",
        "tab.close",
        "tab.next",
        "sidebar.toggle",
        "profile.sleep",
        "app.settings",
        "doNotDisturb.toggle",
        "doNotDisturb.30m",
      ].map((id) => [id, Boolean(app.isAvailable(id))])
    ).toStrictEqual([
      ["tab.back", false],
      ["tab.forward", false],
      ["tab.reload", false],
      ["tab.stop", false],
      ["tab.find", false],
      ["tab.findNext", false],
      ["tab.findPrevious", false],
      ["tab.bookmark", false],
      ["tab.close", false],
      ["tab.next", false],
      ["sidebar.toggle", false],
      ["profile.sleep", false],
      ["app.settings", true],
      ["doNotDisturb.toggle", true],
      ["doNotDisturb.30m", true],
    ]);
  });

  it("while Settings has focus offers Back and Forward as its own history can step, whatever the front tab's can", () => {
    const app = setup();

    app.setNavigation({ canGoBack: true, canGoForward: true, loading: false });
    app.setSettingsFocused(true);
    app.setSettingsHistory({ canGoBack: true, canGoForward: false });

    expect([
      app.isAvailable("tab.back"),
      app.isAvailable("tab.forward"),
      app.isAvailable("tab.reload"),
    ]).toStrictEqual([true, false, false]);
  });

  it("opens Settings on Cmd or Ctrl+comma, from a tab's own window too", async () => {
    const app = setup();
    const command = COMMANDS.find(
      (candidate) => candidate.id === "app.settings"
    );

    await app.run("app.settings");
    app.setOwnWindow({ profileId: "a", tabId: "a1" });

    expect([
      app.isAvailable("app.settings"),
      app.settingsOpened(),
      command?.shortcut,
    ]).toStrictEqual([
      true,
      1,
      { darwin: "Command+,", win32: "Control+,", linux: "Control+," },
    ]);
  });

  it("checks for updates from any window, with no key, and is disabled where the build cannot update itself", async () => {
    const app = setup();
    const command = COMMANDS.find(
      (candidate) => candidate.id === "app.checkForUpdates"
    );

    await app.run("app.checkForUpdates");

    const inMain = app.isAvailable("app.checkForUpdates");

    app.setOwnWindow({ profileId: "a", tabId: "a1" });

    const inOwnWindow = app.isAvailable("app.checkForUpdates");

    app.setOwnWindow(undefined);
    app.setSettingsFocused(true);

    const inSettings = app.isAvailable("app.checkForUpdates");

    app.setCanUpdate(false);

    expect([
      app.updateChecks(),
      inMain,
      inOwnWindow,
      inSettings,
      app.isAvailable("app.checkForUpdates"),
      command?.shortcut,
    ]).toStrictEqual([1, true, true, true, false, undefined]);
  });

  it("opens and closes the unified inbox, offered only with another profile or while it is open", async () => {
    const one = setup({
      version: 1,
      profiles: [newProfile("a", "Default")],
      selectedProfileId: "a",
    });

    expect(one.isAvailable("inbox.toggle")).toBeFalsy();

    const app = setup();

    expect(app.isAvailable("inbox.toggle")).toBeTruthy();
    expect(app.isChecked("inbox.toggle")).toBeFalsy();

    await app.run("inbox.toggle");

    expect(app.isChecked("inbox.toggle")).toBeTruthy();

    await app.run("inbox.toggle");

    expect(app.isChecked("inbox.toggle")).toBeFalsy();
  });

  it("offers no Do Not Disturb, on or off, without Meru Pro", () => {
    const app = setup();
    const ids = COMMANDS.filter((command) =>
      command.id.startsWith("doNotDisturb.")
    ).map((command) => command.id);

    app.refuse("notificationGates");

    expect(ids.map((id) => app.isAvailable(id))).toStrictEqual(
      ids.map(() => false)
    );
  });

  it("offers no unified inbox without Meru Pro, whatever the profiles", () => {
    const app = setup();

    app.refuse("unifiedInbox");

    expect(app.isAvailable("inbox.toggle")).toBeFalsy();
  });

  it("selects the first nine profiles by place, on v3's keys, offering each only while it exists", async () => {
    const app = setup();

    expect(
      [1, 2, 3].map((position) => app.isAvailable(`profile.select.${position}`))
    ).toStrictEqual([true, true, false]);
    expect(
      COMMANDS.filter((command) => command.id.startsWith("profile.select."))
    ).toHaveLength(9);
    expect(commandOf("profile.select.9").shortcut).toStrictEqual({
      darwin: "CommandOrControl+9",
      win32: "CommandOrControl+9",
      linux: "Alt+9",
    });

    await app.run("inbox.toggle");
    await app.run("profile.select.2");

    expect(app.profiles.get().selectedProfileId).toBe("b");
    expect(app.isChecked("inbox.toggle")).toBeFalsy();
  });

  it("selects the selected profile's first nine pinned tabs by place, labelled by their app, offering each only while it exists", async () => {
    const app = setup();
    const label = (id: string) => commandOf(id).label?.(app.context());

    await app.run("tab.next");
    await app.profiles.setPinned({ profileId: "a", tabId: "c1" }, true);

    expect([
      [1, 2, 3].map((position) => app.isAvailable(`tab.pinned.${position}`)),
      label("tab.pinned.1"),
      label("tab.pinned.2"),
    ]).toStrictEqual([[true, true, false], "Gmail", "Calendar"]);
    expect([
      COMMANDS.filter((command) => command.id.startsWith("tab.pinned.")).length,
      commandOf("tab.pinned.9").shortcut,
    ]).toStrictEqual([
      9,
      {
        darwin: "Control+Shift+9",
        win32: "Control+Shift+9",
        linux: "Control+Shift+9",
      },
    ]);

    await app.run("inbox.toggle");
    await app.run("tab.pinned.1");

    expect(selected(app.profiles.get())).toStrictEqual(["a", "gmail"]);
    expect(app.isChecked("inbox.toggle")).toBeFalsy();

    await app.run("profile.select.2");

    expect(app.isAvailable("tab.pinned.2")).toBeFalsy();
  });

  it("numbers the pinned tabs as drawn, a split's box at its pinned tab's place, Gmail first where it stands first", () => {
    const app = setup({
      ...twoProfiles,
      profiles: [
        {
          ...newProfile("a", "Default"),
          tabs: [
            gmailTab(),
            { id: "c1", app: "calendar", url: "", title: "Week" },
            { id: "d1", app: "drive", url: "", title: "", pinned: true },
          ],
          splits: [
            {
              root: {
                direction: "row",
                children: [
                  { size: 0.5, pane: "c1" },
                  { size: 0.5, pane: "d1" },
                ],
              },
            },
          ],
        },
      ],
    });
    const label = (id: string) => commandOf(id).label?.(app.context());

    expect([label("tab.pinned.1"), label("tab.pinned.2")]).toStrictEqual([
      "Gmail",
      "Drive",
    ]);
  });

  it.each(["tab.next", "profile.next"])(
    "closes the unified inbox on %s",
    async (id) => {
      const app = setup();

      await app.run("inbox.toggle");
      await app.run(id);

      expect(app.isChecked("inbox.toggle")).toBeFalsy();
    }
  );

  it("reloads the selected tab", async () => {
    const app = setup();

    await app.run("tab.reload");

    expect(app.reloads()).toBe(1);
  });

  it("puts the selected tab to sleep and wakes it, labelled as it is, with no shortcut, and offers Reload to wake it", async () => {
    const app = setup();
    const label = () => commandOf("tab.sleep").label?.(app.context());
    const gmail = selected(app.profiles.get()).join("/");

    expect([label(), app.isAvailable("tab.reload")]).toStrictEqual([
      "Sleep Tab",
      false,
    ]);

    await app.run("tab.sleep");

    expect([label(), app.isAvailable("tab.reload"), app.sleeps]).toStrictEqual([
      "Wake Tab",
      true,
      [gmail],
    ]);

    await app.run("tab.sleep");

    expect([label(), app.sleeps]).toStrictEqual(["Sleep Tab", [gmail]]);
    expect(commandOf("tab.sleep").shortcut).toBeUndefined();
  });

  it("splits right and down beside the selected tab, separates the focused pane's, and splits nothing beside a tab outside the split", async () => {
    const app = setup();
    const offered = () =>
      ["tab.splitRight", "tab.splitDown", "tab.separate"].map((id) =>
        app.isAvailable(id)
      );

    expect(offered()).toStrictEqual([true, true, false]);

    await app.run("tab.splitRight");
    await app.run("tab.splitDown");
    await app.profiles.splitTab({ profileId: "a", tabId: "c1" }, "row");

    expect([offered(), app.splits]).toStrictEqual([
      [true, true, true],
      ["row", "column"],
    ]);

    await app.profiles.selectTab({ profileId: "a", tabId: "gmail" });
    await app.run("tab.separate");

    expect([
      offered(),
      app.profiles.get().profiles[0]?.splits?.[0],
    ]).toStrictEqual([[true, true, false], undefined]);
    expect(commandOf("tab.splitRight").shortcut?.darwin).toBe(
      "CommandOrControl+Alt+N"
    );
    expect(commandOf("tab.splitDown").shortcut?.darwin).toBe(
      "CommandOrControl+Alt+Shift+N"
    );
  });

  it("maximizes the focused pane and restores the panes, labelled as it is, only in a split", async () => {
    const app = setup();
    const label = () => commandOf("tab.maximize").label?.(app.context());
    const maximized = () =>
      app.profiles.get().profiles[0]?.splits?.[0]?.maximized;

    expect(app.isAvailable("tab.maximize")).toBeFalsy();

    await app.profiles.splitTab({ profileId: "a", tabId: "c1" }, "row");

    expect([app.isAvailable("tab.maximize"), label()]).toStrictEqual([
      true,
      "Maximize Pane",
    ]);

    await app.run("tab.maximize");

    expect([maximized(), label()]).toStrictEqual([true, "Restore Panes"]);

    await app.run("tab.maximize");

    expect([maximized(), label()]).toStrictEqual([undefined, "Maximize Pane"]);
    expect(commandOf("tab.maximize").shortcut?.darwin).toBe(
      "CommandOrControl+Shift+Enter"
    );
  });

  it("offers Back, Forward, Reload and Stop as the front tab's page allows, and none with no page", async () => {
    const app = setup();
    const offered = () =>
      ["tab.back", "tab.forward", "tab.reload", "tab.stop"].map((id) =>
        app.isAvailable(id)
      );

    expect(offered()).toStrictEqual([false, false, false, false]);

    app.setNavigation({ canGoBack: true, canGoForward: false, loading: true });

    expect(offered()).toStrictEqual([true, false, true, true]);

    app.setNavigation({ canGoBack: false, canGoForward: true, loading: false });

    expect(offered()).toStrictEqual([false, true, true, false]);

    await app.run("tab.back");
    await app.run("tab.forward");
    await app.run("tab.stop");

    expect(app.moves).toStrictEqual(["back", "forward", "stop"]);
    expect(commandOf("tab.back").shortcut).toStrictEqual({
      darwin: "Command+[",
      win32: "Alt+Left",
      linux: "Alt+Left",
    });
  });

  it("offers Find over a page, and Find Next and Previous once there is a term, on Cmd or Ctrl+F and G", async () => {
    const app = setup();
    const offered = () =>
      ["tab.find", "tab.findNext", "tab.findPrevious"].map((id) =>
        app.isAvailable(id)
      );
    const noPage = offered();

    app.setFind(true, false);
    const noTerm = offered();

    app.setFind(true, true);
    await app.run("tab.find");
    await app.run("tab.findNext");
    await app.run("tab.findPrevious");

    expect([noPage, noTerm, offered(), app.finds]).toStrictEqual([
      [false, false, false],
      [true, false, false],
      [true, true, true],
      ["open", "next", "previous"],
    ]);
    expect(
      ["tab.find", "tab.findNext", "tab.findPrevious"].map(
        (id) => commandOf(id).shortcut?.darwin
      )
    ).toStrictEqual([
      "CommandOrControl+F",
      "CommandOrControl+G",
      "Shift+CommandOrControl+G",
    ]);
  });

  it("runs Find, Find Next and Previous on the page of the tab whose own window has focus", async () => {
    const app = setup();

    app.setOwnWindow({ profileId: "p0", tabId: "w" });
    app.setFind(true, true);
    await app.run("tab.find");
    await app.run("tab.findNext");
    await app.run("tab.findPrevious");

    expect([
      ["tab.find", "tab.findNext", "tab.findPrevious"].map((id) =>
        app.isAvailable(id)
      ),
      app.finds,
    ]).toStrictEqual([
      [true, true, true],
      ["open w", "next w", "previous w"],
    ]);
  });
});

/** The two profiles, with the selected one's Gmail tab at `url`. */
const gmailAt = (url: string, selectedTabId = "gmail"): State => ({
  ...twoProfiles,
  profiles: twoProfiles.profiles.map((profile, index) =>
    index === 0
      ? {
          ...profile,
          selectedTabId,
          tabs: profile.tabs.map((tab) =>
            "id" in tab && tab.id === "gmail" ? { ...tab, url } : tab
          ),
        }
      : profile
  ),
});

const INBOX = "https://mail.google.com/mail/u/0/";

describe("the Mail menu's commands", () => {
  it("sends the selected profile's Gmail to compose and to its settings", async () => {
    const app = setup();

    await app.run("gmail.compose");
    await app.profiles.select("b");
    await app.run("gmail.settings");

    expect(app.navigations).toStrictEqual(["a #compose", "b #settings"]);
    expect(app.isAvailable("gmail.compose")).toBeTruthy();
    expect(app.isAvailable("gmail.settings")).toBeTruthy();
  });

  it("takes no shortcut for compose, and v3's for Gmail's settings", () => {
    expect(commandOf("gmail.compose").shortcut).toBeUndefined();
    expect(commandOf("gmail.settings").shortcut).toStrictEqual({
      darwin: "CommandOrControl+Shift+,",
      win32: "CommandOrControl+Shift+,",
      linux: "CommandOrControl+Shift+,",
    });
  });

  it("reads the search the selected profile's Gmail shows while it is in front", () => {
    expect(currentSearch(gmailAt(`${INBOX}#search/subject%3A%22a+b%22`))).toBe(
      'subject:"a b"'
    );
    expect(currentSearch(gmailAt(`${INBOX}#inbox`))).toBeUndefined();
    expect(currentSearch(gmailAt(`${INBOX}#search/x`, "c1"))).toBeUndefined();
  });

  it("saves the current search once, for the selected profile alone", async () => {
    const app = setup(gmailAt(`${INBOX}#search/subject%3A%22out+of+office%22`));

    expect(app.isAvailable("savedSearch.save")).toBeTruthy();

    await app.run("savedSearch.save");

    expect(savedSearches(app.profiles.get(), "a")).toStrictEqual([
      { id: "new", query: 'subject:"out of office"' },
    ]);
    expect(savedSearches(app.profiles.get(), "b")).toStrictEqual([]);
    expect(app.isAvailable("savedSearch.save")).toBeFalsy();
  });

  it("runs a saved search and removes it from the menu's items", async () => {
    const app = setup(gmailAt(`${INBOX}#search/subject%3A%22out+of+office%22`));

    await app.run("savedSearch.save");

    const [search] = savedSearchCommands(app.profiles.get());

    expect(search?.open.title()).toBe('subject:"out of office"');

    await search?.open.run(app.context(), app.actions);

    expect(app.navigations).toStrictEqual([
      "a #search/subject%3A%22out%20of%20office%22",
    ]);

    await search?.remove.run(app.context(), app.actions);

    expect(savedSearches(app.profiles.get(), "a")).toStrictEqual([]);
    expect(app.isAvailable("savedSearch.save")).toBeTruthy();
  });

  it("offers no save without Meru Pro, a search in front or not", () => {
    const app = setup(gmailAt(`${INBOX}#search/subject%3A%22out+of+office%22`));

    app.refuse("savedSearches");

    expect(app.isAvailable("savedSearch.save")).toBeFalsy();
  });

  it("offers no save without a search in front", async () => {
    const app = setup(gmailAt(`${INBOX}#inbox`));

    expect(app.isAvailable("savedSearch.save")).toBeFalsy();

    await app.run("savedSearch.save");

    expect(savedSearches(app.profiles.get(), "a")).toStrictEqual([]);
  });
});

describe("Do Not Disturb's commands", () => {
  it("switches Do Not Disturb on for a duration and until tomorrow", async () => {
    const app = setup();

    expect([
      app.isChecked("doNotDisturb.toggle"),
      app.isAvailable("doNotDisturb.off"),
    ]).toStrictEqual([false, false]);

    await app.run("doNotDisturb.30m");

    expect(app.profiles.get().doNotDisturb).toStrictEqual({
      until: new Date(2026, 10, 17, 14, 30).getTime(),
    });
    expect([
      app.isChecked("doNotDisturb.toggle"),
      app.isAvailable("doNotDisturb.off"),
    ]).toStrictEqual([true, true]);

    await app.run("doNotDisturb.untilTomorrow");

    expect(app.profiles.get().doNotDisturb).toStrictEqual({
      until: new Date(2026, 10, 18, 8).getTime(),
    });
  });

  it("toggles Do Not Disturb between until turned off and off, and turns it off", async () => {
    const app = setup();

    await app.run("doNotDisturb.30m");
    await app.run("doNotDisturb.toggle");

    expect(app.profiles.get()).not.toHaveProperty("doNotDisturb");

    await app.run("doNotDisturb.toggle");

    expect(app.profiles.get().doNotDisturb).toStrictEqual({ until: null });

    await app.run("doNotDisturb.off");

    expect(app.profiles.get()).not.toHaveProperty("doNotDisturb");
  });
});
