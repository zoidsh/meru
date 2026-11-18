import { describe, expect, it, onTestFinished } from "vitest";

import { matchesAccelerator } from "#core/accelerator.ts";
import { savedSearches } from "#core/saved-searches.ts";
import { gmailTab, isAsleep, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { Navigation } from "#platform/content-view.ts";

import { COMMANDS, currentSearch, savedSearchCommands } from "./commands.ts";
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
  const renames: string[] = [];
  const navigations: string[] = [];
  let sidebarShown = false;
  let navigation: Navigation | null = null;
  let selectedTabAsleep = false;
  const moves: string[] = [];
  const sleeps: string[] = [];
  const actions: CommandActions = {
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
    addProfile: profiles.add,
    removeProfile: (profileId) => profiles.remove(profileId),
    openRenameProfile: (profileId) => {
      renames.push(profileId);
    },
    setInboxOpen: (open) => {
      inboxOpen = open;
    },
    setOpenAppOpen: (open) => {
      openAppOpen = open;
    },
    switchDoNotDisturb: (choice) =>
      choice === "off"
        ? doNotDisturb.switchOff()
        : doNotDisturb.switchOn(choice),
    navigateGmail: (profileId, hash) => {
      navigations.push(`${profileId} ${hash}`);

      return Promise.resolve();
    },
    saveSearch: profiles.saveSearch,
    removeSavedSearch: profiles.removeSavedSearch,
  };
  const context = (): CommandContext => ({
    state: profiles.get(),
    doNotDisturb: doNotDisturb.current(),
    inboxOpen,
    openAppOpen,
    sidebarShown,
    navigation,
    selectedTabAsleep,
  });

  onTestFinished(doNotDisturb.dispose);

  return {
    profiles,
    reloads: () => reloads,
    moves,
    sleeps,
    setNavigation: (next: Navigation | null) => {
      navigation = next;
    },
    renames,
    navigations,
    openAppOpen: () => openAppOpen,
    context,
    actions,
    isAvailable: (id: string) => commandOf(id).isAvailable?.(context()) ?? true,
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

    await app.run("profile.add");

    expect(app.profiles.get().profiles).toHaveLength(2);
    expect(app.isAvailable("profile.next")).toBeTruthy();
  });

  it("opens Open app, and closes it when run again", async () => {
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

  it("opens the rename of the selected profile", async () => {
    const app = setup();

    await app.run("profile.add");
    await app.run("profile.rename");

    expect(app.renames).toStrictEqual(["new"]);
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

  it("removes the selected profile, offered only while another is left", async () => {
    const app = setup();

    expect(app.isAvailable("profile.remove")).toBeTruthy();

    await app.run("profile.remove");

    expect(app.profiles.get().profiles.map(({ id }) => id)).toStrictEqual([
      "b",
    ]);
    expect(app.isAvailable("profile.remove")).toBeFalsy();
  });

  it.each(["tab.next", "profile.next", "profile.add"])(
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
      until: new Date(2026, 10, 18).getTime(),
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
