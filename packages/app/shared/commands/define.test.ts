import { describe, expect, expectTypeOf, it } from "vitest";

import { parseAccelerator } from "../../core/engines/shortcuts.ts";
import { commandsOf, defineCommands } from "./define.ts";
import { commands } from "./registry.ts";
import type { CommandId } from "./registry.ts";

describe(defineCommands, () => {
  it("gives each command the id feature.name", () => {
    const group = defineCommands("pane", {
      zoomIn: { label: "Zoom in", shortcut: { default: "CmdOrCtrl+Plus" } },
    });
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
    defineCommands("Pane", { zoomIn: { label: "" } });
    // @ts-expect-error: a name has no dot
    defineCommands("pane", { "zoom.in": { label: "" } });
    // @ts-expect-error: a name is camelCase
    expect(defineCommands("pane", { ZoomIn: { label: "" } })).toBeDefined();
  });
});

describe("the command registry", () => {
  it("holds the stage's commands, each once", () => {
    expectTypeOf<CommandId>().toEqualTypeOf<
      | "stage.closeTab"
      | "stage.focusNext"
      | "stage.focusPrevious"
      | "stage.splitHorizontal"
      | "stage.splitVertical"
    >();
    const ids = commands.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(commands)("$id has a default shortcut Electron reads", (command) => {
    const shortcut = command.shortcut?.default;
    expect(
      shortcut === undefined || parseAccelerator(shortcut) !== undefined
    ).toBeTruthy();
  });
});
