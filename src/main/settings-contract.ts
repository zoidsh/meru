import { PAGE_SETTING_KEYS } from "#contract/settings.ts";
import type {
  OverrideChange,
  PageOverrides,
  PageSettingKey,
  PageSettings,
  SettingChange,
  SETTINGS_CALLS,
  SettingsState,
} from "#contract/settings.ts";
import { UNTIL_OFF } from "#core/notification-gate.ts";
import { profileColor } from "#core/profile-color.ts";
import type { State } from "#core/state.ts";

import type { ContractHandlers } from "./contract-ipc.ts";
import type { createDoNotDisturb } from "./do-not-disturb.ts";
import { profileDisplayName } from "./profile-copy.ts";
import type { SettingsStore } from "./settings.ts";

export interface SettingsContractDeps {
  settings: Pick<
    SettingsStore,
    | "get"
    | "update"
    | "updateForProfile"
    | "setOverride"
    | "clearOverride"
    | "overridingProfiles"
  >;
  profiles: { get: () => Pick<State, "profiles"> };
  doNotDisturb: Pick<
    ReturnType<typeof createDoNotDisturb>,
    "current" | "switchOn" | "switchOff"
  >;
}

/** The checks keep each key's value to its own type, which a loop over keys loses. */
interface LooseStore {
  get: (
    key: PageSettingKey,
    profileId?: string
  ) => PageSettings[PageSettingKey];
  update: (
    key: PageSettingKey,
    change: () => PageSettings[PageSettingKey]
  ) => Promise<void>;
  updateForProfile: (
    key: PageSettingKey,
    value: PageSettings[PageSettingKey],
    profileId: string
  ) => Promise<void>;
  setOverride: (
    profileId: string,
    key: PageSettingKey,
    value: PageSettings[PageSettingKey]
  ) => Promise<void>;
}

const listedIds = (profiles: SettingsContractDeps["profiles"]) =>
  profiles.get().profiles.map((profile) => profile.id);

/** Throws unless the profile is one the page lists. */
const assertListed = (
  profiles: SettingsContractDeps["profiles"],
  profileId: string
) => {
  if (!listedIds(profiles).includes(profileId)) {
    throw new Error(`No listed profile has the id ${profileId}`);
  }
};

/**
 * What the Settings window's calls do. With one profile the page edits the
 * app value and shows that profile's, so an app value set then also deletes
 * the profile's own value of the key, or the page would show what main does
 * not use.
 */
export const settingsHandlers = ({
  settings,
  profiles,
  doNotDisturb,
}: SettingsContractDeps): ContractHandlers<typeof SETTINGS_CALLS> => {
  const store = settings as unknown as LooseStore;

  return {
    update: async (change) => {
      const { key, value } = change as SettingChange;
      const ids = listedIds(profiles);
      const [lone] = ids;

      await (ids.length === 1 && lone !== undefined
        ? store.updateForProfile(key, value, lone)
        : store.update(key, () => value));
    },
    setOverride: async (change) => {
      const { profileId, key, value } = change as OverrideChange;

      assertListed(profiles, profileId);
      await store.setOverride(profileId, key, value);
    },
    clearOverride: async ({ profileId, key }) => {
      assertListed(profiles, profileId);
      await settings.clearOverride(profileId, key);
    },
    // On from here holds until turned off; the durations are the titlebar's.
    setDoNotDisturb: ({ on }) =>
      on ? doNotDisturb.switchOn(UNTIL_OFF) : doNotDisturb.switchOff(),
  };
};

/** The state the Settings window reads; overrides of an unlisted id are never sent. */
export const readSettingsState = ({
  settings,
  profiles,
  doNotDisturb,
}: SettingsContractDeps): SettingsState => {
  const store = settings as unknown as LooseStore;
  const state = profiles.get();
  const overriding = new Map(
    PAGE_SETTING_KEYS.map((key) => [key, settings.overridingProfiles(key)])
  );
  const current = doNotDisturb.current();

  return {
    settings: Object.fromEntries(
      PAGE_SETTING_KEYS.map((key) => [key, store.get(key)])
    ) as PageSettings,
    doNotDisturb: { on: current !== undefined, until: current?.until ?? null },
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      name: profileDisplayName(profile),
      color: profileColor(state, profile.id),
      overrides: Object.fromEntries(
        PAGE_SETTING_KEYS.filter((key) =>
          overriding.get(key)?.includes(profile.id)
        ).map((key) => [key, store.get(key, profile.id)])
      ) as PageOverrides,
    })),
  };
};
