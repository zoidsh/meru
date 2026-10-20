import { msg } from "@lingui/core/macro";

/**
 * Each page's name, read by both its sidebar item and its title, so the two
 * can't drift apart in any language. The end-to-end walk relies on the title
 * containing the item's label.
 */
// lingui-set comment="A page of Settings, named in the settings sidebar and as the page's title"
export const settingsPageLabels = {
  general: msg`General`,
  accounts: msg`Accounts`,
  appearance: msg`Appearance`,
  blocker: msg`Blocker`,
  downloads: msg`Downloads`,
  workspaceApps: msg`Workspace apps`,
  extensions: msg`Extensions`,
  languages: msg`Languages`,
  notifications: msg`Notifications`,
  phishingProtection: msg`Phishing protection`,
  savedSearches: msg`Saved searches`,
  unifiedInbox: msg`Unified inbox`,
  updates: msg`Updates`,
  verificationCodes: msg`Verification codes`,
  advanced: msg`Advanced`,
  license: msg`License`,
  versionHistory: msg`What's new`,
  about: msg`About Meru`,
};
// lingui-reset
