import { describe, expect, it } from "vitest";

import {
  GATED_SETTINGS,
  entitledSetting,
  settingCapability,
  settingWritable,
} from "./entitled-settings.ts";
import type { Capability } from "./entitlement.ts";
import { gmailFeatures } from "./gmail-hooks.ts";
import type { SettingKey } from "./settings.ts";

const free = () => false;
const pro = () => true;

describe(entitledSetting, () => {
  it("reads every stored value as found while its capability is held", () => {
    expect([
      entitledSetting("unifiedInbox", true, pro),
      entitledSetting("titlebarUnifiedInbox", true, pro),
      entitledSetting("theme", "dark", free),
    ]).toStrictEqual([true, true, "dark"]);
  });

  it("reads the unified inbox's settings as off without Meru Pro", () => {
    expect([
      entitledSetting("unifiedInbox", true, free),
      entitledSetting("titlebarUnifiedInbox", true, free),
    ]).toStrictEqual([false, false]);
  });

  it("holds nothing by quiet hours or important only, and hides the moon's button, without Meru Pro", () => {
    expect([
      entitledSetting("quietHours", [{ start: "22:00", end: "07:00" }], free),
      entitledSetting("notificationImportantOnly", true, free),
      entitledSetting("titlebarDoNotDisturb", true, free),
    ]).toStrictEqual([[], false, false]);
  });

  it("shows Meru's own screen picker without Meru Pro, whatever is stored", () => {
    expect([
      entitledSetting("systemScreenPicker", true, free),
      entitledSetting("systemScreenPicker", true, pro),
      settingWritable("systemScreenPicker", free),
    ]).toStrictEqual([false, true, false]);
  });

  it("hides the title bar's New tab button without Meru Pro, the free version opening no tab", () => {
    expect([
      entitledSetting("titlebarNewTab", true, free),
      entitledSetting("titlebarNewTab", true, pro),
      settingWritable("titlebarNewTab", free),
    ]).toStrictEqual([false, true, false]);
  });

  it("finds no verification code without Meru Pro, the settings under it read as stored", () => {
    expect([
      entitledSetting("verificationCodes", true, free),
      entitledSetting("verificationCodesDuringDoNotDisturb", false, free),
      entitledSetting("verificationCodeCopyMode", "immediately", free),
      entitledSetting("verificationCodeAfterCopy", "trash", free),
    ]).toStrictEqual([false, false, "immediately", "trash"]);
  });

  it("writes Show during Do Not Disturb only with verification codes, as the rows beside it", () => {
    expect([
      settingWritable("verificationCodesDuringDoNotDisturb", free),
      settingWritable("verificationCodesDuringDoNotDisturb", pro),
      settingWritable("verificationCodeAfterCopy", free),
    ]).toStrictEqual([false, true, false]);
  });

  it("plays Linen without Meru Pro whatever sound was chosen, the system's included, and nothing for none", () => {
    expect(
      (["system", "duet", "linen", "none"] as const).map((sound) =>
        entitledSetting("notificationSound", sound, free)
      )
    ).toStrictEqual(["linen", "linen", "linen", "none"]);
  });

  it("blocks neither ads nor trackers without Meru Pro", () => {
    expect([
      entitledSetting("blockAds", true, free),
      entitledSetting("blockTrackers", true, free),
    ]).toStrictEqual([false, false]);
  });

  it("asks before no link without Meru Pro, the trusted sites read as stored", () => {
    expect([
      entitledSetting("confirmLinks", true, free),
      entitledSetting("trustedSites", ["https://example.com"], free),
    ]).toStrictEqual([false, ["https://example.com"]]);
  });

  it("opens no Google app in Meru without Meru Pro and sends none out by name, as stored with it", () => {
    expect([
      entitledSetting("openAppsInMeru", true, free),
      entitledSetting("appsInDefaultBrowser", ["drive"], free),
      entitledSetting("openAppsInMeru", true, pro),
      entitledSetting("appsInDefaultBrowser", ["drive"], pro),
      settingWritable("openAppsInMeru", free),
      settingWritable("appsInDefaultBrowser", free),
    ]).toStrictEqual([false, [], true, ["drive"], false, false]);
  });

  it("opens every new tab in the main window without Meru Pro and reads Show windows in the sidebar as stored, writing neither", () => {
    expect([
      entitledSetting("openAppsIn", "windows", free),
      entitledSetting("openAppsIn", "windows", pro),
      entitledSetting("showWindowsInSidebar", false, free),
      settingWritable("openAppsIn", free),
      settingWritable("showWindowsInSidebar", free),
    ]).toStrictEqual(["tabs", "windows", false, false, false]);
  });

  it("applies none of Gmail's page settings without Meru Pro but the inbox footer's hide, which was never Pro", () => {
    expect(
      gmailFeatures((feature) => entitledSetting(feature, true, free))
    ).toStrictEqual({
      hideInboxFooter: true,
      hidePromoBanner: false,
      hideUpgradeButton: false,
      reverseConversation: false,
      moveAttachmentsToTop: false,
      showTrimmedContent: false,
      extendDarkTheme: false,
    });
    expect(
      gmailFeatures((feature) => entitledSetting(feature, true, pro))
    ).toStrictEqual(gmailFeatures(() => true));
  });

  it("asks only the capability the setting needs", () => {
    const asked: Capability[] = [];

    entitledSetting("titlebarUnifiedInbox", true, (capability) => {
      asked.push(capability);

      return true;
    });

    expect(asked).toStrictEqual(["unifiedInbox"]);
  });
});

describe(settingWritable, () => {
  it("refuses a gated setting without its capability and nothing else", () => {
    const gated = Object.keys(GATED_SETTINGS) as SettingKey[];

    expect([
      gated.map((key) => settingWritable(key, free)),
      gated.map((key) => settingWritable(key, pro)),
      settingWritable("theme", free),
      settingCapability("theme"),
    ]).toStrictEqual([
      gated.map(() => false),
      gated.map(() => true),
      true,
      undefined,
    ]);
  });
});
