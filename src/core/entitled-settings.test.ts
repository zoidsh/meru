import { describe, expect, it } from "vitest";

import {
  GATED_SETTINGS,
  entitledSetting,
  settingCapability,
  settingWritable,
} from "./entitled-settings.ts";
import type { Capability } from "./entitlement.ts";
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
