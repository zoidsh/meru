import { describe, expect, it } from "vitest";

import { ok } from "../../core/result.ts";
import { defineCommands } from "../../shared/commands/define.ts";
import { CommandDispatcher } from "./commands.ts";

const group = defineCommands(
  "demo",
  { first: { label: "First" } },
  { label: "Demo", order: 0 }
);

describe(CommandDispatcher, () => {
  it("registers only the group's commands, and takes every one back", () => {
    const dispatcher = new CommandDispatcher<string>();
    const handlers = { first: () => ok(null), stray: () => ok(null) };
    const unregister = dispatcher.register(group, handlers);
    const registered = [
      dispatcher.enabled("demo.first"),
      dispatcher.enabled("demo.stray"),
    ];
    unregister();
    expect([...registered, dispatcher.enabled("demo.first")]).toStrictEqual([
      true,
      false,
      false,
    ]);
  });
});
