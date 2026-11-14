import { isPlainObject } from "es-toolkit";

import type { Migration } from "../../../core/engines/migrate.ts";

// The glossary's words: the unread badge, and one tray icon for the menu bar and the system tray alike.
const RENAMED: Readonly<Record<string, string>> = {
  "inbox.dockBadge": "inbox.unreadBadge",
  "tray.enabled": "tray.icon",
};

/** Version 1 to 2: the global layer's renamed keys under their new names; where both tray keys are stored, the menu bar's, since only macOS showed it. */
export const renameGlobalKeys: Migration = (data) => {
  if (!isPlainObject(data) || !isPlainObject(data.global)) {
    return data;
  }
  const global: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data.global)) {
    if (key !== "tray.menuBar") {
      global[RENAMED[key] ?? key] = value;
    }
  }
  if (Object.hasOwn(data.global, "tray.menuBar")) {
    global["tray.icon"] = data.global["tray.menuBar"];
  }
  return { ...data, global };
};
