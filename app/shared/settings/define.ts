import type { z } from "zod";

import type { SettingScope, SettingSpec } from "../../core/engines/settings.ts";
import type { Platform } from "../../core/records/platform.ts";
import type { DottedKey, Name } from "../key.ts";
import type { Message } from "../msg.ts";

/** A page of the settings window: what it is called and where it sits down the left, lowest first. */
export interface SettingsPage<Id extends string = string> {
  readonly id: Id;
  readonly label: Message;
  readonly order: number;
}

export const defineSettingsPage = <const Id extends string>(
  id: Id & Name<Id>,
  page: Omit<SettingsPage<Id>, "id">
): SettingsPage<Id> => ({ ...page, id });

/** A choice's settings name each of its values; any other kind names none. */
type OptionsOf<S extends z.ZodType> = S extends z.ZodEnum
  ? { readonly options: Readonly<Record<z.output<S> & string, Message>> }
  : z.ZodEnum extends S
    ? { readonly options?: Readonly<Record<string, Message>> }
    : { readonly options?: undefined };

interface SettingFacts<
  S extends z.ZodType,
  Scope extends SettingScope,
  Page extends string,
> extends Omit<SettingSpec<string, S, Scope>, "key"> {
  readonly tier: "free" | "pro";
  readonly restart: boolean;
  /** The id of the settings page the setting sits on, which a feature's settings.ts declares with defineSettingsPage. */
  readonly page: Page;
  readonly label: Message;
  readonly description?: Message;
  /** The platforms the setting does anything on; every one when absent. */
  readonly platforms?: readonly Platform[];
}

type SettingEntry<
  S extends z.ZodType,
  Scope extends SettingScope,
  Page extends string,
> = SettingFacts<S, Scope, Page> & OptionsOf<S>;

export type Setting<
  K extends string = string,
  S extends z.ZodType = z.ZodType,
  Scope extends SettingScope = SettingScope,
  Page extends string = string,
> = { readonly key: K } & SettingEntry<S, Scope, Page>;

export const defineSetting = <
  const K extends string,
  S extends z.ZodType,
  const Scope extends SettingScope,
  const Page extends string,
>(
  key: K & DottedKey<K>,
  entry: SettingEntry<S, Scope, Page>
): Setting<K, S, Scope, Page> => ({ ...entry, key });
