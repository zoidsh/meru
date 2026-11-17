import { describe, expect, it } from "vitest";

import { inboxKeyCommand } from "./inbox-keys.ts";
import type { InboxKeyCommand } from "./inbox-keys.ts";

describe(inboxKeyCommand, () => {
  it.each<[string, boolean, InboxKeyCommand]>([
    ["e", false, { kind: "action", action: "archive" }],
    ["I", true, { kind: "action", action: "markAsRead" }],
    ["#", true, { kind: "action", action: "delete" }],
    ["!", true, { kind: "action", action: "markAsSpam" }],
    ["j", false, { kind: "move", to: "next" }],
    ["ArrowUp", false, { kind: "move", to: "previous" }],
    ["End", false, { kind: "move", to: "last" }],
    ["o", false, { kind: "open" }],
    ["Enter", false, { kind: "open" }],
    // With Caps Lock on.
    ["E", false, { kind: "action", action: "archive" }],
    ["i", true, { kind: "action", action: "markAsRead" }],
    ["J", false, { kind: "move", to: "next" }],
    ["O", false, { kind: "open" }],
  ])("answers %s (Shift %s), Caps Lock or not", (key, shiftKey, command) => {
    expect(inboxKeyCommand({ key, shiftKey })).toStrictEqual(command);
  });

  it.each<[string, boolean]>([
    ["I", false],
    ["i", false],
    ["E", true],
    ["x", false],
    ["constructor", false],
  ])("takes nothing else: %s (Shift %s)", (key, shiftKey) => {
    expect(inboxKeyCommand({ key, shiftKey })).toBeUndefined();
  });
});
