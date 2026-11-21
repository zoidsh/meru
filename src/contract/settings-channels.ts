// Apart from the schemas in settings.ts, so the Settings window's preload,
// which needs only these names, carries no zod.

import { contractChannels } from "./channels.ts";

export const SETTINGS_CALL_NAMES = [
  "update",
  "setOverride",
  "clearOverride",
  "setDoNotDisturb",
] as const;

export type SettingsCallName = (typeof SETTINGS_CALL_NAMES)[number];

export const SETTINGS_CHANNELS = contractChannels<SettingsCallName>("settings");
