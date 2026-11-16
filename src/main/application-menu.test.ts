import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import {
  buildMenuTemplate,
  createApplicationMenu,
} from "./application-menu.ts";
import { commandsFor } from "./commands.ts";
import type { CommandActions, CommandContext, Platform } from "./commands.ts";
import { createSettingsStore } from "./settings.ts";

const oneProfile: State = {
  version: 1,
  profiles: [newProfile("a", "Default")],
  selectedProfileId: "a",
};

const contextOf = (
  design: "modern" | "classic" = "modern"
): CommandContext => ({
  state: oneProfile,
  setting: ((key: string) =>
    key === "design" ? design : true) as CommandContext["setting"],
});

const template = (platform: Platform, context = contextOf()) =>
  buildMenuTemplate({
    platform,
    appName: "Meru",
    commands: commandsFor(platform),
    context,
    run: () => false,
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

const VIEW = [
  "design.modern",
  "design.classic",
  "tab.reload",
  "resetZoom",
  "zoomIn",
  "zoomOut",
  "togglefullscreen",
];

describe(buildMenuTemplate, () => {
  it("on macOS has the app menu, the standard roles, every command and Help", () => {
    const menus = template("darwin");
    const [app, edit, view, tabs, window, help] = outline(menus);

    expect(menus.map((menu) => menu.label)).toStrictEqual([
      "Meru",
      "Edit",
      "View",
      "Tabs",
      "Window",
      "Help",
    ]);
    expect([app, edit, tabs]).toStrictEqual([
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
      ["Tabs", ["tab.next", "tab.previous", "tab.close"]],
    ]);
    expect([view, window, help]).toStrictEqual([
      ["View", VIEW.toSpliced(2, 0, "vibrancy.toggle")],
      [
        "Window",
        [
          "minimize",
          "zoom",
          "close",
          "profile.next",
          "profile.previous",
          "profile.add",
          "profile.rename",
          "front",
        ],
      ],
      ["Help", []],
    ]);
    // The roles' own keys stand: Command+Q, Command+W and the zoom keys.
    expect(
      ["quit", "close", "zoomIn"].map(
        (role) => itemOf(menus, role)?.accelerator
      )
    ).toStrictEqual([undefined, undefined, undefined]);
  });

  it.each(["win32", "linux"] as const)(
    "on %s has no vibrancy, no Help, Quit on Ctrl+Q and a Close with no key",
    (platform) => {
      const menus = template(platform);
      const close = itemOf(menus, "window.close");

      expect(outline(menus)).toStrictEqual([
        ["Meru", ["quit"]],
        ["Edit", outline(template("darwin"))[1]?.[1]],
        ["View", VIEW],
        ["Tabs", ["tab.next", "tab.previous", "tab.close"]],
        [
          "Window",
          [
            "minimize",
            "window.close",
            "profile.next",
            "profile.previous",
            "profile.add",
            "profile.rename",
          ],
        ],
      ]);
      expect(itemOf(menus, "quit")?.accelerator).toBe("CommandOrControl+Q");
      expect([close?.role, close?.accelerator]).toStrictEqual([
        undefined,
        undefined,
      ]);
      expect(
        ["profile.next", "profile.previous"].map(
          (id) => itemOf(menus, id)?.accelerator
        )
      ).toStrictEqual([undefined, undefined]);
    }
  );

  it("ends the View menu with the developer tools only when given them", () => {
    const given = buildMenuTemplate({
      platform: "darwin",
      appName: "Meru",
      commands: commandsFor("darwin"),
      context: contextOf(),
      run: () => false,
      developerTools: { role: "toggleDevTools" },
    });

    expect(outline(given)[2]?.[1]?.at(-1)).toBe("toggleDevTools");
    expect(outline(template("darwin"))[2]?.[1]).not.toContain("toggleDevTools");
  });

  it("checks the design in use", () => {
    const menus = template("darwin", contextOf("classic"));

    expect(
      ["design.modern", "design.classic"].map((id) => {
        const choice = itemOf(menus, id);

        return [choice?.label, choice?.type, choice?.checked];
      })
    ).toStrictEqual([
      ["Modern", "radio", false],
      ["Classic", "radio", true],
    ]);
  });
});

const viewItem = (menus: MenuItemConstructorOptions[], id: string) =>
  menus.flatMap(submenu).find((item) => item.id === id);

const setup = () => {
  const set: MenuItemConstructorOptions[][] = [];
  let state = oneProfile;
  const settings = createSettingsStore({
    initial: { version: 1 },
    save: () => Promise.resolve(),
    log: () => false,
  });
  let reloads = 0;
  const selected: string[] = [];
  const actions = {
    updateSetting: settings.update,
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
    commands: commandsFor("darwin"),
    context: () => ({ state, setting: settings.get }),
    actions,
    setMenu: (next) => set.push(next),
    log: () => false,
  });

  settings.onChange("design", menu.refresh);

  return {
    set,
    menu,
    settings,
    reloads: () => reloads,
    selected,
    setState: (next: State) => {
      state = next;
      menu.refresh();
    },
  };
};

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

  it("runs a clicked item's command and checks what it chose", async () => {
    const app = setup();

    viewItem(app.set[0] ?? [], "design.classic")?.click?.(
      ...([] as unknown as Parameters<
        NonNullable<MenuItemConstructorOptions["click"]>
      >)
    );
    await expect.poll(() => app.settings.get("design")).toBe("classic");
    await expect
      .poll(() => viewItem(app.set.at(-1) ?? [], "design.classic")?.checked)
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
