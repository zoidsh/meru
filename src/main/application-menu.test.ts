import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it } from "vitest";

import { newProfile } from "#core/state.ts";
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

/** Each menu with its items, as a person reads them, and what each does. */
const outline = (menus: MenuItemConstructorOptions[]) =>
  menus.map((menu) => [
    menu.label,
    submenu(menu).map((item) =>
      item.type === "separator"
        ? "-"
        : [
            item.label,
            item.role ?? item.id,
            item.accelerator ?? "",
            ...(item.type === "radio" || item.type === "checkbox"
              ? [item.type, item.checked]
              : []),
            ...(item.enabled === false ? ["disabled"] : []),
          ]
    ),
  ]);

describe(buildMenuTemplate, () => {
  it("on macOS has the app menu, the standard roles, the design as radio items and vibrancy", () => {
    expect(outline(template("darwin"))).toStrictEqual([
      [
        "Meru",
        [
          ["About Meru", "about", ""],
          "-",
          ["Services", "services", ""],
          "-",
          ["Hide Meru", "hide", ""],
          ["Hide Others", "hideOthers", ""],
          ["Show All", "unhide", ""],
          "-",
          ["Quit Meru", "quit", ""],
        ],
      ],
      [
        "Edit",
        [
          ["Undo", "undo", ""],
          ["Redo", "redo", ""],
          "-",
          ["Cut", "cut", ""],
          ["Copy", "copy", ""],
          ["Paste", "paste", ""],
          ["Paste and Match Style", "pasteAndMatchStyle", ""],
          ["Delete", "delete", ""],
          ["Select All", "selectAll", ""],
        ],
      ],
      [
        "View",
        [
          ["Modern", "design.modern", "", "radio", true],
          ["Classic", "design.classic", "", "radio", false],
          "-",
          ["Vibrancy", "vibrancy.toggle", "", "checkbox", true],
          "-",
          ["Reload", "tab.reload", "CommandOrControl+R"],
        ],
      ],
      [
        "Tabs",
        [
          ["Select Next Tab", "tab.next", "Ctrl+Tab", "disabled"],
          ["Select Previous Tab", "tab.previous", "Ctrl+Shift+Tab", "disabled"],
          "-",
          ["Close Tab", "tab.close", "CommandOrControl+Shift+W", "disabled"],
        ],
      ],
      [
        "Window",
        [
          ["Minimize", "minimize", ""],
          ["Zoom", "zoom", ""],
          "-",
          [
            "Select Next Profile",
            "profile.next",
            "Command+Shift+]",
            "disabled",
          ],
          [
            "Select Previous Profile",
            "profile.previous",
            "Command+Shift+[",
            "disabled",
          ],
          "-",
          ["Add Profile", "profile.add", ""],
          "-",
          ["Bring All to Front", "front", ""],
        ],
      ],
      ["Help", []],
    ]);
  });

  it.each(["win32", "linux"] as const)(
    "on %s has no vibrancy, no profile shortcuts and no empty Help menu",
    (platform) => {
      const menus = outline(template(platform));

      expect(menus.map(([label]) => label)).toStrictEqual([
        "Meru",
        "Edit",
        "View",
        "Tabs",
        "Window",
      ]);
      expect(menus[0]).toStrictEqual(["Meru", [["Quit Meru", "quit", ""]]]);
      expect(menus[2]).toStrictEqual([
        "View",
        [
          ["Modern", "design.modern", "", "radio", true],
          ["Classic", "design.classic", "", "radio", false],
          "-",
          ["Reload", "tab.reload", "CommandOrControl+R"],
        ],
      ]);
      expect(menus[4]).toStrictEqual([
        "Window",
        [
          ["Minimize", "minimize", ""],
          ["Close", "close", ""],
          "-",
          ["Select Next Profile", "profile.next", "", "disabled"],
          ["Select Previous Profile", "profile.previous", "", "disabled"],
          "-",
          ["Add Profile", "profile.add", ""],
        ],
      ]);
    }
  );

  it("checks the design in use", () => {
    const view = outline(template("darwin", contextOf("classic"))).find(
      ([label]) => label === "View"
    );

    expect(view?.[1]?.slice(0, 2)).toStrictEqual([
      ["Modern", "design.modern", "", "radio", false],
      ["Classic", "design.classic", "", "radio", true],
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
  const actions = {
    setSetting: settings.set,
    reloadSelectedTab: () => {
      reloads += 1;
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
        ...modifiers,
      });

    expect(key("KeyR", { meta: true })).toBeTruthy();
    await expect.poll(() => app.reloads()).toBe(1);

    expect(key("KeyR", { control: true })).toBeFalsy();
    expect(key("KeyX", { meta: true })).toBeFalsy();
    // There is no other profile to select.
    expect(key("BracketRight", { meta: true, shift: true })).toBeFalsy();
  });
});
