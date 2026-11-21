import { contextBridge } from "electron";

import {
  SETTINGS_CALL_NAMES,
  SETTINGS_CHANNELS,
} from "#contract/settings-channels.ts";
import type {
  SettingsBridge,
  SettingsCalls,
  SettingsState,
} from "#contract/settings.ts";

import { contractBridge } from "../bridge.ts";

// Stamped on the document rather than exposed, so styles can make room for the
// macOS traffic lights without the page reaching anything of the preload's.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.platform = process.platform;
});

// macOS closes it on Cmd+W through the menu's Close Window; elsewhere the menu's
// Close takes no key, since Ctrl+W must not close the main window.
if (process.platform !== "darwin") {
  window.addEventListener("keydown", (event) => {
    if (
      event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      event.code === "KeyW"
    ) {
      event.preventDefault();
      window.close();
    }
  });
}

const bridge: SettingsBridge = contractBridge<SettingsCalls, SettingsState>(
  SETTINGS_CALL_NAMES,
  SETTINGS_CHANNELS
);

contextBridge.exposeInMainWorld("meru", bridge);
