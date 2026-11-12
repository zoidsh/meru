import type { z } from "zod";

import type { SettingScope, SettingSpec } from "../../core/engines/settings.ts";
import type { DottedKey } from "../key.ts";
import type { Message } from "../msg.ts";

export type SettingsPage = "appearance" | "panes" | "shortcuts";

export interface Setting<
  K extends string = string,
  S extends z.ZodType = z.ZodType,
  Scope extends SettingScope = SettingScope,
> extends SettingSpec<K, S, Scope> {
  readonly tier: "free" | "pro";
  readonly restart: boolean;
  readonly page: SettingsPage;
  readonly label: Message;
  readonly description?: Message;
}

export const defineSetting = <
  const K extends string,
  S extends z.ZodType,
  const Scope extends SettingScope,
>(
  key: K & DottedKey<K>,
  entry: Omit<Setting<K, S, Scope>, "key">
): Setting<K, S, Scope> => ({ ...entry, key });
