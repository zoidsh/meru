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

const bridge: SettingsBridge = contractBridge<SettingsCalls, SettingsState>(
  SETTINGS_CALL_NAMES,
  SETTINGS_CHANNELS
);

contextBridge.exposeInMainWorld("meru", bridge);
