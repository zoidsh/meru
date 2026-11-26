import type { Capability } from "./entitlement.ts";
import type { SettingKey, SettingValue } from "./settings.ts";
import type { NotificationSound } from "./sounds.ts";

/** The one sound the free version plays. */
export const FREE_SOUND: NotificationSound = "linen";

interface GatedSetting<Key extends SettingKey> {
  capability: Capability;
  /**
   * What a run without the capability reads in place of the stored value,
   * which stays stored; absent for a key that does nothing on its own then,
   * whose stored value is read.
   */
  free?: (stored: SettingValue<Key>) => SettingValue<Key>;
}

/**
 * The settings that belong to a Pro capability: without it each reads as
 * `free` has it and none is written, so a license brings back what is stored.
 */
export const GATED_SETTINGS: {
  readonly [Key in SettingKey]?: GatedSetting<Key>;
} = {
  unifiedInbox: { capability: "unifiedInbox", free: () => false },
  titlebarUnifiedInbox: { capability: "unifiedInbox", free: () => false },
  quietHours: { capability: "notificationGates", free: () => [] },
  notificationImportantOnly: {
    capability: "notificationGates",
    free: () => false,
  },
  titlebarDoNotDisturb: { capability: "notificationGates", free: () => false },
  // Its command opens a tab, which the free version's one tab never does.
  titlebarNewTab: { capability: "workspaceApps", free: () => false },
  verificationCodes: { capability: "verificationCodes", free: () => false },
  verificationCodesDuringDoNotDisturb: { capability: "verificationCodes" },
  verificationCodeCopyMode: { capability: "verificationCodes" },
  verificationCodeAfterCopy: { capability: "verificationCodes" },
  // Linen at its volume, or nothing for a person who chose none: never the
  // system's sound, nor silence for a choice the run does not offer.
  notificationSound: {
    capability: "notificationSound",
    free: (stored) => (stored === "none" ? "none" : FREE_SOUND),
  },
  blockAds: { capability: "blocker", free: () => false },
  blockTrackers: { capability: "blocker", free: () => false },
  // Links open without asking; the trusted sites stay as stored, unwritten.
  confirmLinks: { capability: "linkConfirmation", free: () => false },
  trustedSites: { capability: "linkConfirmation" },
  // No Google app but Gmail opens in Meru without the capability anyway.
  openAppsInMeru: { capability: "workspaceApps", free: () => false },
  appsInDefaultBrowser: { capability: "workspaceApps", free: () => [] },
  // The free version's one tab is always on screen, so neither does anything.
  sleepIdleTabs: { capability: "workspaceApps" },
  sleepAfter: { capability: "workspaceApps" },
  // The footer's hide was never Pro, so it alone of Gmail's page applies.
  hidePromoBanner: { capability: "gmailPageSettings", free: () => false },
  hideUpgradeButton: { capability: "gmailPageSettings", free: () => false },
  extendDarkTheme: { capability: "gmailPageSettings", free: () => false },
  reverseConversation: { capability: "gmailPageSettings", free: () => false },
  moveAttachmentsToTop: { capability: "gmailPageSettings", free: () => false },
  showTrimmedContent: { capability: "gmailPageSettings", free: () => false },
  systemScreenPicker: { capability: "screenSharePicker", free: () => false },
};

/** The capability the setting needs, if any. */
export const settingCapability = (key: SettingKey): Capability | undefined =>
  GATED_SETTINGS[key]?.capability;

/** The value the run reads: the stored one, or the free one without the capability. */
export const entitledSetting = <Key extends SettingKey>(
  key: Key,
  stored: SettingValue<Key>,
  can: (capability: Capability) => boolean
): SettingValue<Key> => {
  const gated = GATED_SETTINGS[key] as GatedSetting<Key> | undefined;

  return gated?.free && !can(gated.capability) ? gated.free(stored) : stored;
};

/** Whether the run may write the setting. */
export const settingWritable = (
  key: SettingKey,
  can: (capability: Capability) => boolean
) => {
  const capability = settingCapability(key);

  return capability === undefined || can(capability);
};
