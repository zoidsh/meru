import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it } from "vitest";

import type { Platform } from "#core/platform.ts";
import { decodeState, gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import {
  buildLaunchMenuTemplate,
  buildMenuTemplate,
  createApplicationMenu,
} from "./application-menu.ts";
import { COMMANDS } from "./commands.ts";
import type { CommandActions, CommandContext } from "./commands.ts";

const oneProfile: State = {
  version: 1,
  profiles: [newProfile("a", "Default")],
  selectedProfileId: "a",
};

const contextOf = (): CommandContext => ({
  state: oneProfile,
  ownWindow: undefined,
  settingsFocused: false,
  settingsHistory: undefined,
  doNotDisturb: undefined,
  inboxOpen: false,
  downloadsOpen: false,
  openAppOpen: false,
  sidebarShown: false,
  navigation: null,
  selectedTabAsleep: false,
  findable: false,
  canFindAgain: false,
  bookmarked: undefined,
});

const template = (platform: Platform, context = contextOf()) =>
  buildMenuTemplate({
    platform,
    appName: "Meru",
    commands: COMMANDS,
    context,
    run: () => false,
    locale: "en",
    zoom: () => false,
  });

const submenu = (menu: MenuItemConstructorOptions) =>
  (menu.submenu ?? []) as MenuItemConstructorOptions[];

/** Each menu's label with what its items do: a role, or a command's id. */
const outline = (menus: MenuItemConstructorOptions[]) =>
  menus.map((menu) => [
    menu.label,
    submenu(menu)
      .filter((item) => item.type !== "separator")
      .map((item) => item.role ?? item.id),
  ]);

const itemOf = (menus: MenuItemConstructorOptions[], id: string) =>
  menus.flatMap(submenu).find((item) => (item.role ?? item.id) === id);

const labels = (menus: MenuItemConstructorOptions[]) =>
  menus.map((menu) => menu.label);

describe(buildMenuTemplate, () => {
  it("on macOS keeps the roles' own keys and has Help", () => {
    const menus = template("darwin");

    expect(labels(menus)).toContain("Help");
    // Command+Q and Command+W.
    expect(
      ["quit", "close"].map((role) => itemOf(menus, role)?.accelerator)
    ).toStrictEqual([undefined, undefined]);
  });

  it("zooms through its own items on the zoom roles' keys, which main points at the page", () => {
    const zoomed: string[] = [];
    const menus = buildMenuTemplate({
      platform: "darwin",
      appName: "Meru",
      commands: COMMANDS,
      context: contextOf(),
      run: () => false,
      locale: "en",
      zoom: (change) => zoomed.push(change),
    });
    const items = ["view.resetZoom", "view.zoomIn", "view.zoomOut"].map((id) =>
      itemOf(menus, id)
    );

    for (const item of items) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the click takes no arguments of ours
      const click = item?.click as (() => void) | undefined;

      click?.();
    }

    expect([
      items.map((item) => [item?.role, item?.accelerator]),
      zoomed,
    ]).toStrictEqual([
      [
        [undefined, "CommandOrControl+0"],
        [undefined, "CommandOrControl+Plus"],
        [undefined, "CommandOrControl+-"],
      ],
      ["reset", "in", "out"],
    ]);
  });

  it.each(["win32", "linux"] as const)(
    "on %s has no Help, Quit on Ctrl+Q and a Close with no key, so Ctrl+W in a page cannot quit",
    (platform) => {
      const menus = template(platform);
      const close = itemOf(menus, "window.close");

      expect(labels(menus)).not.toContain("Help");
      expect(itemOf(menus, "quit")?.accelerator).toBe("CommandOrControl+Q");
      expect(close).toBeDefined();
      expect([close?.role, close?.accelerator]).toStrictEqual([
        undefined,
        undefined,
      ]);
    }
  );

  it("puts Settings in the app menu, after About on macOS and first elsewhere", () => {
    expect(
      (["darwin", "win32"] as const).map((platform) =>
        outline(template(platform))[0]?.[1]?.slice(0, 3)
      )
    ).toStrictEqual([
      ["about", "app.settings", undefined],
      ["app.settings", undefined, "quit"],
    ]);
  });

  it("ends the Edit menu with Find, Find Next and Find Previous", () => {
    expect(outline(template("darwin"))[1]?.[1]?.slice(-3)).toStrictEqual([
      "tab.find",
      "tab.findNext",
      "tab.findPrevious",
    ]);
  });

  it("ends the View menu with the developer tools only when given them", () => {
    const given = buildMenuTemplate({
      platform: "darwin",
      appName: "Meru",
      commands: COMMANDS,
      context: contextOf(),
      run: () => false,
      locale: "en",
      zoom: () => false,
      developerTools: { role: "toggleDevTools" },
    });

    expect(outline(given)[2]?.[1]?.at(-1)).toBe("toggleDevTools");
    expect(outline(template("darwin"))[2]?.[1]).not.toContain("toggleDevTools");
  });

  it("puts the Mail menu between View and Tabs, with no access key, as no other menu has one", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const menus = template(platform);

      expect(labels(menus).slice(2, 5)).toStrictEqual(["View", "Mail", "Tabs"]);
      expect(
        labels(menus).filter((label) => label?.includes("&"))
      ).toHaveLength(0);
    }

    expect(outline(template("darwin"))[3]?.[1]).toStrictEqual([
      "gmail.compose",
      undefined,
      "gmail.settings",
    ]);
  });

  it("lists each profile with a shortcut by its name in the Window menu, then the profile commands", () => {
    const context: CommandContext = {
      ...contextOf(),
      state: {
        ...oneProfile,
        profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
      },
    };
    const menus = template("darwin", context);
    const windowItems = submenu(menus.at(-2) ?? {}).filter(
      (item) => item.id?.startsWith("profile.") ?? false
    );

    expect(
      windowItems.map(({ id, label, accelerator }) => [id, label, accelerator])
    ).toStrictEqual([
      ["profile.select.1", "Default", "CommandOrControl+1"],
      ["profile.select.2", "Work", "CommandOrControl+2"],
      ["profile.next", "Select Next Profile", "Command+Shift+]"],
      ["profile.previous", "Select Previous Profile", "Command+Shift+["],
      ["profile.sleep", "Sleep Profile", undefined],
    ]);
  });

  it("leaves a profile turned off out of the Window menu, the next one taking its place and shortcut", () => {
    const context: CommandContext = {
      ...contextOf(),
      state: {
        ...oneProfile,
        profiles: [
          newProfile("a", "Default"),
          { ...newProfile("b", "Work"), disabled: true },
          newProfile("c", "Club"),
        ],
      },
    };
    const menus = template("darwin", context);
    const selectItems = submenu(menus.at(-2) ?? {}).filter(
      (item) => item.id?.startsWith("profile.select.") ?? false
    );

    expect(
      selectItems.map(({ id, label, accelerator }) => [id, label, accelerator])
    ).toStrictEqual([
      ["profile.select.1", "Default", "CommandOrControl+1"],
      ["profile.select.2", "Club", "CommandOrControl+2"],
    ]);
  });

  it("disables Sleep Profile for the last awake profile", () => {
    expect(
      [
        [newProfile("a", "Default")],
        [newProfile("a", "Default"), newProfile("b", "Work")],
        [
          newProfile("a", "Default"),
          { ...newProfile("b", "Work"), asleep: true },
        ],
      ].map(
        (profiles) =>
          submenu(
            template("darwin", {
              ...contextOf(),
              state: { ...oneProfile, profiles },
            }).at(-2) ?? {}
          ).find((item) => item.id === "profile.sleep")?.enabled
      )
    ).toStrictEqual([false, true, false]);
  });

  it("lists each pinned tab with a shortcut by its app in the Tabs menu, between the tab steps and Sleep Tab", () => {
    const context: CommandContext = {
      ...contextOf(),
      state: {
        ...oneProfile,
        profiles: [
          {
            ...newProfile("a", "Default"),
            tabs: [
              gmailTab(),
              { id: "c1", app: "calendar", url: "", title: "Week" },
              {
                id: "d1",
                app: "drive",
                url: "",
                title: "",
                pinned: true,
                openAtLaunch: false,
              },
            ],
          },
        ],
      },
    };
    const tabs = submenu(template("darwin", context)[4] ?? {});

    expect(
      tabs
        .filter((item) => item.type !== "separator")
        .map(({ id, label, accelerator }) => [id, label, accelerator])
    ).toStrictEqual([
      ["app.open", "New Tab…", "CommandOrControl+T"],
      ["tab.bookmark", "Bookmark Tab", "CommandOrControl+D"],
      ["tab.next", expect.any(String), expect.any(String)],
      ["tab.previous", expect.any(String), expect.any(String)],
      ["tab.pinned.1", "Gmail", "Control+Shift+1"],
      ["tab.pinned.2", "Drive", "Control+Shift+2"],
      ["tab.sleep", "Sleep Tab", undefined],
      ["tab.splitRight", "Split Right", "CommandOrControl+Alt+N"],
      ["tab.splitDown", "Split Down", "CommandOrControl+Alt+Shift+N"],
      ["tab.maximize", "Maximize Pane", "CommandOrControl+Shift+Enter"],
      ["tab.separate", "Separate from Split", undefined],
      ["tab.moveToNewWindow", "Move to New Window", "CommandOrControl+Shift+N"],
      [
        "tab.moveToMainWindow",
        "Move to Main Window",
        "CommandOrControl+Shift+M",
      ],
      ["tab.pin", "Unpin Tab", undefined],
      ["tab.openAtLaunch", "Open at Launch", undefined],
      ["tab.close", expect.any(String), expect.any(String)],
    ]);
  });

  it("lists the selected profile's saved searches by name, to run and to remove, with & kept as text", () => {
    const context: CommandContext = {
      ...contextOf(),
      state: {
        ...oneProfile,
        profiles: [
          {
            ...newProfile("a", "Default"),
            savedSearches: [
              { id: "s1", query: "from:a&b" },
              { id: "s2", query: "is:starred", label: "Stars" },
            ],
          },
        ],
      },
    };

    for (const platform of ["darwin", "linux"] as const) {
      const mail = template(platform, context)[3] as MenuItemConstructorOptions;
      const searches = submenu(mail).find(
        (item) => item.label === "Saved Searches"
      ) as MenuItemConstructorOptions;
      const remove = submenu(searches).find(
        (item) => item.label === "Remove Saved Search"
      ) as MenuItemConstructorOptions;
      const name = platform === "darwin" ? "from:a&b" : "from:a&&b";

      expect(
        submenu(searches).map((item) => item.id ?? item.type)
      ).toStrictEqual([
        "savedSearch.open.s1",
        "savedSearch.open.s2",
        "separator",
        "savedSearch.save",
        undefined,
      ]);
      expect(
        submenu(searches)
          .slice(0, 2)
          .map((item) => item.label)
      ).toStrictEqual([name, "Stars"]);
      expect(remove.enabled).toBeTruthy();
      expect(
        submenu(remove).map((item) => [item.id, item.label])
      ).toStrictEqual([
        ["savedSearch.remove.s1", name],
        ["savedSearch.remove.s2", "Stars"],
      ]);
    }
  });

  it("builds at startup from a saved query that is not well formed, which it leaves out", () => {
    const decoded = decodeState(
      JSON.parse(
        String.raw`{"version":1,"selectedProfileId":"a","profiles":[{"id":"a","name":"Default","savedSearches":[{"id":"b","query":"x\ud800"}]}]}`
      )
    );

    if (decoded.kind !== "read") {
      throw new Error("The state did not decode");
    }

    const context = { ...contextOf(), state: decoded.value };
    const searches = submenu(
      template("darwin", context)[3] as MenuItemConstructorOptions
    ).find(
      (item) => item.label === "Saved Searches"
    ) as MenuItemConstructorOptions;

    expect(submenu(searches)[0]?.label).toBe("No Saved Searches");
  });

  it("says there are no saved searches, and offers none to remove, while there are none", () => {
    const mail = template("darwin")[3] as MenuItemConstructorOptions;
    const searches = submenu(mail).find(
      (item) => item.label === "Saved Searches"
    ) as MenuItemConstructorOptions;

    expect(
      submenu(searches).map((item) => [item.label, item.enabled])
    ).toStrictEqual([
      ["No Saved Searches", false],
      [undefined, undefined],
      ["Save Current Search", false],
      ["Remove Saved Search", false],
    ]);
  });
});

const withSearches = (savedSearches: unknown[]): State => ({
  ...oneProfile,
  profiles: [{ ...newProfile("a", "Default"), savedSearches }],
});

const viewItem = (menus: MenuItemConstructorOptions[], id: string) =>
  menus.flatMap(submenu).find((item) => item.id === id);

const setup = () => {
  const set: MenuItemConstructorOptions[][] = [];
  let state = oneProfile;
  let reloads = 0;
  let inboxOpen = false;
  const selected: string[] = [];
  const zoomed: string[] = [];
  const actions = {
    setInboxOpen: (open: boolean) => {
      inboxOpen = open;
    },
    reloadSelectedTab: () => {
      reloads += 1;
    },
    selectTab: ({ tabId }) => {
      selected.push(tabId);

      return Promise.resolve();
    },
  } as Partial<CommandActions> as CommandActions;
  const menu = createApplicationMenu({
    platform: "darwin",
    appName: "Meru",
    commands: COMMANDS,
    context: () => ({
      state,
      ownWindow: undefined,
      settingsFocused: false,
      settingsHistory: undefined,
      doNotDisturb: undefined,
      navigation: { canGoBack: false, canGoForward: false, loading: false },
      inboxOpen,
      downloadsOpen: false,
      openAppOpen: false,
      sidebarShown: false,
      selectedTabAsleep: false,
      findable: false,
      canFindAgain: false,
      bookmarked: undefined,
    }),
    actions,
    locale: () => "en",
    zoom: (change) => zoomed.push(change),
    setMenu: (next) => set.push(next),
    log: () => false,
  });

  return {
    set,
    menu,
    reloads: () => reloads,
    selected,
    zoomed,
    setState: (next: State) => {
      state = next;
      menu.refresh();
    },
  };
};

/** Each menu's items, by role or id, separators left out. */
const launchOutline = (platform: Platform) =>
  buildLaunchMenuTemplate({ platform, appName: "Meru" }).map((menu) => [
    menu.label,
    (menu.submenu as MenuItemConstructorOptions[])
      .filter((item) => item.type !== "separator")
      .map((item) => item.role ?? item.id),
  ]);

describe(buildLaunchMenuTemplate, () => {
  it("offers only the app's and the window's own items and editing while the launch waits, with nothing that reaches a profile", () => {
    expect(launchOutline("darwin")).toStrictEqual([
      ["Meru", ["about", "services", "hide", "hideOthers", "unhide", "quit"]],
      [
        "Edit",
        [
          "undo",
          "redo",
          "cut",
          "copy",
          "paste",
          "pasteAndMatchStyle",
          "delete",
          "selectAll",
        ],
      ],
      ["Window", ["minimize", "zoom", "close", "front"]],
    ]);
    expect(launchOutline("linux").map(([label]) => label)).toStrictEqual([
      "Meru",
      "Edit",
      "Window",
    ]);
    expect(launchOutline("win32")[2]).toStrictEqual([
      "Window",
      ["minimize", "window.close"],
    ]);
  });
});

describe(createApplicationMenu, () => {
  it("sets the menu at once, and again only when what it offers changes", () => {
    const app = setup();

    expect(app.set).toHaveLength(1);

    app.menu.refresh();
    expect(app.set).toHaveLength(1);

    app.setState({
      ...oneProfile,
      profiles: [...oneProfile.profiles, newProfile("b", "Profile 2")],
    });

    expect(app.set).toHaveLength(2);
    expect(viewItem(app.set[1] ?? [], "profile.next")?.enabled).toBeTruthy();
  });

  it("sets the menu again when the saved searches it lists change", () => {
    const app = setup();

    app.setState(withSearches([{ id: "s1", query: "x" }]));
    app.setState(withSearches([{ id: "s1", query: "x" }]));
    app.setState(withSearches([{ id: "s1", query: "x", label: "Named" }]));
    app.setState(withSearches([]));

    expect(app.set).toHaveLength(4);
  });

  it("sets the menu again when the selected tab is pinned or unpinned, its item labelled as it reads", () => {
    const app = setup();
    const unpinned: State = {
      ...oneProfile,
      profiles: [
        {
          ...newProfile("a", "Default"),
          tabs: [{ ...gmailTab(), pinned: false }],
        },
      ],
    };
    const pin = (index: number) => viewItem(app.set[index] ?? [], "tab.pin");
    const atLaunch = (index: number) =>
      viewItem(app.set[index] ?? [], "tab.openAtLaunch");

    app.setState(unpinned);

    expect([
      pin(0)?.label,
      atLaunch(0)?.type,
      atLaunch(0)?.checked,
      pin(1)?.label,
      atLaunch(1)?.enabled,
      atLaunch(1)?.checked,
    ]).toStrictEqual(["Unpin Tab", "checkbox", true, "Pin Tab", false, false]);
  });

  it("runs a clicked item's command and checks what it chose", async () => {
    const app = setup();

    expect(viewItem(app.set[0] ?? [], "inbox.toggle")?.checked).toBeFalsy();

    viewItem(app.set[0] ?? [], "inbox.toggle")?.click?.(
      ...([] as unknown as Parameters<
        NonNullable<MenuItemConstructorOptions["click"]>
      >)
    );
    await expect
      .poll(() => viewItem(app.set.at(-1) ?? [], "inbox.toggle")?.checked)
      .toBeTruthy();
  });

  it("runs the available command a key in a page is, and leaves every other key to the page", async () => {
    const app = setup();
    const key = (code: string, modifiers: object) =>
      app.menu.handleKey({
        type: "keyDown",
        key: code.replace(/^Key/u, "").toLowerCase(),
        code,
        control: false,
        shift: false,
        alt: false,
        meta: false,
        isAutoRepeat: false,
        ...modifiers,
      });

    expect(key("KeyR", { meta: true })).toBeTruthy();
    await expect.poll(() => app.reloads()).toBe(1);

    expect(key("KeyR", { control: true })).toBeFalsy();
    expect(key("KeyX", { meta: true })).toBeFalsy();
    // There is no other profile to select.
    expect(key("BracketRight", { meta: true, shift: true })).toBeFalsy();
  });

  it("zooms on the zoom keys a view hears, = with or without Shift zooming in", () => {
    const app = setup();
    const press = (key: string, code: string, shift = false) =>
      app.menu.handleKey({
        type: "keyDown",
        key,
        code,
        control: false,
        shift,
        alt: false,
        meta: true,
        isAutoRepeat: false,
      });

    expect([
      press("=", "Equal"),
      press("+", "Equal", true),
      press("-", "Minus"),
      press("0", "Digit0"),
    ]).toStrictEqual([true, true, true, true]);
    expect(app.zoomed).toStrictEqual(["in", "in", "out", "reset"]);
  });

  it("runs a held key's command once where repeating it would step on", () => {
    const app = setup();

    app.setState({
      ...oneProfile,
      profiles: [
        {
          ...newProfile("a", "Default"),
          tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "" }],
        },
      ],
    });

    const nextTab = (isAutoRepeat: boolean) =>
      app.menu.handleKey({
        type: "keyDown",
        key: "Tab",
        code: "Tab",
        control: true,
        shift: false,
        alt: false,
        meta: false,
        isAutoRepeat,
      });

    expect([nextTab(false), nextTab(true), nextTab(true)]).toStrictEqual([
      true,
      true,
      true,
    ]);
    expect(app.selected).toStrictEqual(["c1"]);
  });
});
