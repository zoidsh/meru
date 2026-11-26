// Apart from the schemas in settings.ts, so the Settings window's preload,
// which needs only these names, carries no zod.

import { contractChannels } from "./channels.ts";
import { ENTITLEMENT_CALL_NAMES } from "./entitlement-channels.ts";

export const SETTINGS_CALL_NAMES = [
  "update",
  "setOverride",
  "clearOverride",
  "setDoNotDisturb",
  "previewSound",
  "showTestNotification",
  "openPage",
  "goBack",
  "goForward",
  "addProfile",
  "renameProfile",
  "setProfileColor",
  "moveProfile",
  "removeProfile",
  "setCheckMail",
  "setUnifiedInbox",
  "setAsleep",
  "addSavedSearch",
  "renameSavedSearch",
  "removeSavedSearch",
  "setProfileEnabled",
  "deleteBrowsingData",
  "signIn",
  "setOpenAtLogin",
  "chooseDownloadsFolder",
  "setSpellcheckLanguage",
  "setAppInDefaultBrowser",
  "removeTrustedSite",
  "openSettingsFile",
  "clearCache",
  "copyAboutValue",
  ...ENTITLEMENT_CALL_NAMES,
] as const;

export type SettingsCallName = (typeof SETTINGS_CALL_NAMES)[number];

export const SETTINGS_CHANNELS = contractChannels<SettingsCallName>("settings");
