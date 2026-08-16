import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

let createdMenuItemCount = 0;

function takeMenuItemId(createProperties: unknown) {
  if (createProperties !== null && typeof createProperties === "object") {
    const { id } = createProperties as { id?: unknown };

    if (typeof id === "string" || typeof id === "number") {
      return id;
    }
  }

  createdMenuItemCount += 1;

  return createdMenuItemCount;
}

/**
 * The one method here that answers synchronously with the id it assigned, using
 * its optional callback only to signal that the item was created.
 */
function createMenuItem(...callArguments: unknown[]) {
  const menuItemId = takeMenuItemId(callArguments[0]);

  const callback = callArguments.at(-1);

  if (typeof callback === "function") {
    queueMicrotask(() => {
      callback();
    });
  }

  return menuItemId;
}

export function createContextMenus(): ChromeNamespace {
  return {
    ACTION_MENU_TOP_LEVEL_LIMIT: 6,

    create: createMenuItem,
    update: createNoopMethod(() => undefined),
    remove: createNoopMethod(() => undefined),
    removeAll: createNoopMethod(() => undefined),

    onClicked: createNoopEvent(),
  };
}
