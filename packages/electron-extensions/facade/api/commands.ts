import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

export function createCommands(): ChromeNamespace {
  return {
    // No command is bound to anything, so the extension is told about none
    getAll: createNoopMethod(() => []),

    onCommand: createNoopEvent(),
    onChanged: createNoopEvent(),
  };
}
