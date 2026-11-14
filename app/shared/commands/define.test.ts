import { describe, expect, expectTypeOf, it } from "vitest";

import { parseAccelerator } from "../../core/engines/shortcuts.ts";
import { commandsOf, defineCommands } from "./define.ts";
import { commands } from "./registry.ts";
import type { CommandId } from "./registry.ts";

const SECTION = { label: "Panes", order: 0 };

describe(defineCommands, () => {
  it("gives each command the id feature.name", () => {
    const group = defineCommands(
      "pane",
      {
        zoomIn: { label: "Zoom in", shortcut: { default: "CmdOrCtrl+Plus" } },
      },
      SECTION
    );
    const [zoomIn] = commandsOf(group);
    expect(zoomIn).toStrictEqual({
      id: "pane.zoomIn",
      label: "Zoom in",
      shortcut: { default: "CmdOrCtrl+Plus" },
    });
    expectTypeOf(commandsOf(group)[0]?.id).toEqualTypeOf<
      "pane.zoomIn" | undefined
    >();
  });

  it("takes only a camelCase feature and names", () => {
    // @ts-expect-error: the feature is lower case
    defineCommands("Pane", { zoomIn: { label: "" } }, SECTION);
    // @ts-expect-error: a name has no dot
    defineCommands("pane", { "zoom.in": { label: "" } }, SECTION);
    expect(
      // @ts-expect-error: a name is camelCase
      defineCommands("pane", { ZoomIn: { label: "" } }, SECTION)
    ).toBeDefined();
  });
});

describe("the command registry", () => {
  it("holds every feature's commands, each once", () => {
    expectTypeOf<CommandId>().toEqualTypeOf<
      | "profiles.next"
      | "profiles.previous"
      | "profiles.select1"
      | "profiles.select2"
      | "profiles.select3"
      | "profiles.select4"
      | "profiles.select5"
      | "profiles.select6"
      | "profiles.select7"
      | "profiles.select8"
      | "profiles.select9"
      | "settings.open"
      | "sidebar.toggle"
      | "sidebar.toggleWidth"
      | "sleep.toggleTab"
      | "stage.back"
      | "stage.equalise"
      | "stage.closeTab"
      | "stage.focusNext"
      | "stage.focusPrevious"
      | "stage.forward"
      | "stage.maximise"
      | "stage.reload"
      | "stage.splitHorizontal"
      | "stage.splitVertical"
      | "stage.stop"
      | "stage.swap"
      | "launcher.open"
      | "updater.check"
      | "updater.install"
    >();
    const ids = commands.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(commands)("$id has default shortcuts Electron reads", (command) => {
    const shortcuts = [command.shortcut?.default, command.shortcut?.darwin];
    expect(
      shortcuts.every(
        (shortcut) =>
          shortcut === undefined || parseAccelerator(shortcut) !== undefined
      )
    ).toBeTruthy();
  });
});
