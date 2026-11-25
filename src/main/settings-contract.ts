import {
  PAGE_OVERRIDABLE_KEYS,
  PAGE_SETTING_KEYS,
} from "#contract/settings.ts";
import type {
  OverrideChange,
  PageOverridableKey,
  PageOverrides,
  PageSettingKey,
  PageSettings,
  SettingChange,
  SETTINGS_CALLS,
  SettingsState,
} from "#contract/settings.ts";
import type { BrowsingDataKinds } from "#core/browsing-data.ts";
import { CAPABILITIES, MERU_PRO_URL } from "#core/entitlement.ts";
import { UNTIL_OFF } from "#core/notification-gate.ts";
import {
  isProfileColorName,
  profileColor,
  profileColorName,
} from "#core/profile-color.ts";
import { savedSearches } from "#core/saved-searches.ts";
import {
  canDisableProfile,
  canRemoveProfile,
  canSleepProfile,
  checksMail,
  isAsleep,
  isDisabled,
} from "#core/state.ts";
import type { Profile, State } from "#core/state.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { ContractHandlers } from "./contract-ipc.ts";
import type { createDoNotDisturb } from "./do-not-disturb.ts";
import { checkedDockChange } from "./dock.ts";
import type { Entitlement } from "./entitlement.ts";
import type { GeneralPage } from "./general-page.ts";
import type { Language } from "./language.ts";
import type { LicenseRequests } from "./license-requests.ts";
import type { MailPoller } from "./mail.ts";
import { profileDisplayName } from "./profile-copy.ts";
import type { Profiles } from "./profiles.ts";
import type { SettingsPages } from "./settings-pages.ts";
import type { SettingsStore } from "./settings.ts";
import type { SoundOutput } from "./sounds.ts";
import type { TrustedSites } from "./trusted-sites.ts";

export interface SettingsContractDeps {
  settings: Pick<
    SettingsStore,
    "get" | "update" | "setOverride" | "clearOverride" | "overridingProfiles"
  >;
  profiles: Pick<
    Profiles,
    | "rename"
    | "move"
    | "setColor"
    | "setCheckMail"
    | "sleep"
    | "select"
    | "addSavedSearch"
    | "renameSavedSearch"
    | "removeSavedSearch"
    | "setEnabled"
  > & {
    get: () => State;
    /** The stored profiles this run does not use. */
    locked: () => readonly Profile[];
  };
  mail: Pick<MailPoller, "mail" | "address">;
  /** Adds a profile and selects it, closing what stands over the new one. */
  addProfile: () => Promise<string | undefined>;
  /** Asks to remove the profile, and removes it once confirmed. */
  removeProfile: (profileId: string) => Promise<void>;
  /** Deletes the kinds of the profile's browsing data asked for. */
  deleteBrowsingData: (
    profileId: string,
    kinds: BrowsingDataKinds
  ) => Promise<void>;
  /**
   * Selects the profile in the main window and shows its Gmail tab, bringing
   * the window forward.
   */
  signIn: (profileId: string) => Promise<void>;
  doNotDisturb: Pick<
    ReturnType<typeof createDoNotDisturb>,
    "current" | "switchOn" | "switchOff"
  >;
  sound: Pick<SoundOutput, "play">;
  /** The language Meru shows, which the window shows too. */
  language: Pick<Language, "current">;
  pages: Pick<
    SettingsPages,
    "current" | "canGoBack" | "canGoForward" | "open" | "step"
  >;
  /** For a profile, or the app with none. */
  showTestNotification: (profileId: string | undefined) => void;
  general: Pick<
    GeneralPage,
    | "read"
    | "onChange"
    | "setOpenAtLogin"
    | "chooseDownloadsFolder"
    | "setSpellcheckLanguage"
  >;
  trustedSites: Pick<TrustedSites, "list" | "remove">;
  entitlement: Pick<
    Entitlement,
    | "snapshot"
    | "activate"
    | "setDeviceName"
    | "retry"
    | "copyLicenseKey"
    | "continueFree"
    | "can"
  >;
  licenseRequests: Pick<LicenseRequests, "run" | "busy">;
  /** Meru's own links' browser, which holds a link while Meru is the default. */
  systemBrowser: Pick<SystemBrowser, "open">;
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
  setOverride: (
    profileId: string,
    key: PageOverridableKey,
    value: PageSettings[PageSettingKey]
  ) => Promise<void>;
}

const listedIds = (profiles: Pick<SettingsContractDeps["profiles"], "get">) =>
  profiles.get().profiles.map((profile) => profile.id);

/** Throws unless the profile is one the page lists. */
const assertListed = (
  profiles: Pick<SettingsContractDeps["profiles"], "get">,
  profileId: string
) => {
  if (!listedIds(profiles).includes(profileId)) {
    throw new Error(`No listed profile has the id ${profileId}`);
  }
};

/** Throws unless the listed profile shows a saved search with the id. */
const assertSearch = (
  profiles: Pick<SettingsContractDeps["profiles"], "get">,
  profileId: string,
  searchId: string
) => {
  assertListed(profiles, profileId);

  if (
    !savedSearches(profiles.get(), profileId).some(
      (search) => search.id === searchId
    )
  ) {
    throw new Error(`No saved search of ${profileId} has the id ${searchId}`);
  }
};

/**
 * Throws while a profile's own values do not apply, so the free version never
 * writes one it would not read.
 */
const assertProfileValues = (entitlement: Pick<Entitlement, "can">) => {
  if (!entitlement.can("profiles")) {
    throw new Error("A profile's own values need Meru Pro");
  }
};

/** What the Settings window's calls do. */
export const settingsHandlers = ({
  settings,
  profiles,
  addProfile,
  doNotDisturb,
  sound,
  pages,
  showTestNotification,
  removeProfile,
  deleteBrowsingData,
  signIn,
  general,
  trustedSites,
  entitlement,
  licenseRequests,
  systemBrowser,
}: SettingsContractDeps): ContractHandlers<typeof SETTINGS_CALLS> => {
  const store = settings as unknown as LooseStore;

  return {
    update: async (change) => {
      const { key, value } = change as SettingChange;

      await (key === "dockIcon"
        ? settings.update(
            "dockIcon",
            checkedDockChange(settings, value as boolean)
          )
        : store.update(key, () => value));
    },
    setOverride: async (change) => {
      const { profileId, key, value } = change as OverrideChange;

      assertListed(profiles, profileId);
      assertProfileValues(entitlement);
      await store.setOverride(profileId, key, value);
    },
    clearOverride: async ({ profileId, key }) => {
      assertListed(profiles, profileId);
      assertProfileValues(entitlement);
      await settings.clearOverride(profileId, key);
    },
    // On from here holds until turned off; the durations are the titlebar's.
    setDoNotDisturb: ({ on }) =>
      on ? doNotDisturb.switchOn(UNTIL_OFF) : doNotDisturb.switchOff(),
    // Asked for, so no gate of a notification's holds it.
    previewSound: ({ sound: name }) =>
      Promise.try(() => {
        sound.play({
          sound: name,
          volume: settings.get("notificationSoundVolume"),
        });
      }),
    showTestNotification: ({ profileId }) =>
      Promise.try(() => {
        if (profileId !== null) {
          assertListed(profiles, profileId);
        }

        // The page disables the button too, but Do Not Disturb can turn on
        // between its render and the click.
        if (doNotDisturb.current() !== undefined) {
          throw new Error("Do Not Disturb holds every notification");
        }

        showTestNotification(profileId ?? undefined);
      }),
    openPage: (page) =>
      Promise.try(() => {
        if (page.profileId !== null) {
          if (page.section !== "profiles") {
            throw new Error("Only Profiles holds a profile's page");
          }

          assertListed(profiles, page.profileId);
        }

        pages.open(page);
      }),
    goBack: () =>
      Promise.try(() => {
        pages.step(-1);
      }),
    goForward: () =>
      Promise.try(() => {
        pages.step(1);
      }),
    addProfile: async () => {
      const profileId = await addProfile();

      if (profileId === undefined) {
        throw new Error("The profile was not added");
      }

      pages.open({ section: "profiles", profileId });

      return profileId;
    },
    renameProfile: async ({ profileId, name }) => {
      assertListed(profiles, profileId);
      await profiles.rename(profileId, name);
    },
    setProfileColor: async ({ profileId, color }) => {
      assertListed(profiles, profileId);
      await profiles.setColor(profileId, color);
    },
    moveProfile: async ({ profileId, toIndex }) => {
      assertListed(profiles, profileId);

      const count = profiles.get().profiles.length;

      if (toIndex >= count) {
        throw new Error(`No place ${toIndex} among ${count} profiles`);
      }

      await profiles.move(profileId, toIndex);
    },
    removeProfile: async ({ profileId }) => {
      assertListed(profiles, profileId);

      if (!canRemoveProfile(profiles.get(), profileId)) {
        throw new Error("The last enabled profile cannot be removed");
      }

      await removeProfile(profileId);
    },
    setCheckMail: async ({ profileId, on }) => {
      assertListed(profiles, profileId);
      await profiles.setCheckMail(profileId, on);
    },
    // Equal to the app value it is cleared, so the file holds only what
    // differs, and an app value of false from an earlier build keeps every
    // profile without one of its own out.
    setUnifiedInbox: async ({ profileId, on }) => {
      assertListed(profiles, profileId);
      assertProfileValues(entitlement);
      await (on === settings.get("unifiedInbox")
        ? settings.clearOverride(profileId, "unifiedInbox")
        : settings.setOverride(profileId, "unifiedInbox", on));
    },
    setAsleep: async ({ profileId, asleep }) => {
      assertListed(profiles, profileId);

      const state = profiles.get();
      const profile = state.profiles.find(
        (candidate) => candidate.id === profileId
      );

      // A switch pressed twice quickly asks again for what is already so.
      if (profile && isAsleep(state, profile) === asleep) {
        return;
      }

      if (profile && isDisabled(state, profile)) {
        throw new Error("A profile turned off neither sleeps nor wakes");
      }

      if (!asleep) {
        await profiles.select(profileId);

        return;
      }

      if (!canSleepProfile(profiles.get(), profileId)) {
        throw new Error("The last awake profile cannot sleep");
      }

      await profiles.sleep(profileId);
    },
    addSavedSearch: async ({ profileId, query, name }) => {
      assertListed(profiles, profileId);

      return (await profiles.addSavedSearch(profileId, query, name)) ?? null;
    },
    renameSavedSearch: async ({ profileId, searchId, name }) => {
      assertSearch(profiles, profileId, searchId);
      await profiles.renameSavedSearch(profileId, searchId, name);
    },
    removeSavedSearch: async ({ profileId, searchId }) => {
      assertSearch(profiles, profileId, searchId);
      await profiles.removeSavedSearch(profileId, searchId);
    },
    setProfileEnabled: async ({ profileId, enabled }) => {
      assertListed(profiles, profileId);

      if (!enabled && !canDisableProfile(profiles.get(), profileId)) {
        const profile = profiles
          .get()
          .profiles.find((candidate) => candidate.id === profileId);

        // Pressed twice quickly, it asks again for what is already so.
        if (profile && isDisabled(profiles.get(), profile)) {
          return;
        }

        throw new Error("The last enabled profile cannot be turned off");
      }

      await profiles.setEnabled(profileId, enabled);
    },
    deleteBrowsingData: async ({ profileId, cookies, cache }) => {
      assertListed(profiles, profileId);

      if (!cookies && !cache) {
        throw new Error("Neither cookies nor the cache was chosen to delete");
      }

      await deleteBrowsingData(profileId, { cookies, cache });
    },
    signIn: async ({ profileId }) => {
      assertListed(profiles, profileId);

      const state = profiles.get();
      const profile = state.profiles.find(
        (candidate) => candidate.id === profileId
      );

      if (profile && isDisabled(state, profile)) {
        throw new Error("A profile turned off cannot be signed in to");
      }

      await signIn(profileId);
    },
    setOpenAtLogin: ({ on }) =>
      Promise.try(() => {
        general.setOpenAtLogin(on);
      }),
    chooseDownloadsFolder: () => general.chooseDownloadsFolder(),
    setSpellcheckLanguage: ({ code, on }) =>
      general.setSpellcheckLanguage(code, on),
    removeTrustedSite: ({ site }) => trustedSites.remove(site),
    activateLicense: ({ licenseKey }) =>
      licenseRequests.run(() => entitlement.activate(licenseKey)),
    setDeviceName: ({ name }) =>
      licenseRequests.run(() => entitlement.setDeviceName(name)),
    retryEntitlement: () => licenseRequests.run(entitlement.retry),
    copyLicenseKey: () => entitlement.copyLicenseKey(),
    continueFree: () => entitlement.continueFree(),
    openMeruPro: () => systemBrowser.open(MERU_PRO_URL),
  };
};

/** The state the Settings window reads; overrides of an unlisted id are never sent. */
export const readSettingsState = ({
  settings,
  profiles,
  mail,
  doNotDisturb,
  pages,
  general,
  language,
  trustedSites,
  entitlement,
  licenseRequests,
}: Pick<
  SettingsContractDeps,
  | "settings"
  | "profiles"
  | "mail"
  | "doNotDisturb"
  | "pages"
  | "general"
  | "language"
  | "trustedSites"
  | "entitlement"
  | "licenseRequests"
>): SettingsState => {
  const store = settings as unknown as LooseStore;
  const state = profiles.get();
  const locked = profiles.locked();
  const overriding = new Map(
    PAGE_OVERRIDABLE_KEYS.map((key) => [key, settings.overridingProfiles(key)])
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
      colorName:
        profile.color === undefined || isProfileColorName(profile.color)
          ? profileColorName(state, profile.id)
          : null,
      enabled: !isDisabled(state, profile),
      asleep: isAsleep(state, profile),
      checkMail: checksMail(profile),
      unifiedInbox: settings.get("unifiedInbox", profile.id),
      mail: {
        status: mail.mail(profile.id).status,
        address: mail.address(profile.id) ?? null,
      },
      savedSearches: savedSearches(state, profile.id).map(
        ({ id, query, label }) => ({ id, query, name: label?.trim() || null })
      ),
      overrides: Object.fromEntries(
        PAGE_OVERRIDABLE_KEYS.filter((key) =>
          overriding.get(key)?.includes(profile.id)
        ).map((key) => [key, store.get(key, profile.id)])
      ) as PageOverrides,
    })),
    lockedProfiles: locked.map((profile) => ({
      id: profile.id,
      name: profileDisplayName(profile),
      // Their places follow the profiles in use, as in the stored row.
      color: profileColor(
        { profiles: [...state.profiles, ...locked] },
        profile.id
      ),
    })),
    proRequired: CAPABILITIES.filter(
      (capability) => !entitlement.can(capability)
    ),
    general: general.read(),
    trustedSites: trustedSites.list(),
    language: language.current(),
    entitlement: entitlement.snapshot(),
    licenseRequest: licenseRequests.busy(),
    page: {
      ...pages.current(),
      canGoBack: pages.canGoBack(),
      canGoForward: pages.canGoForward(),
    },
  };
};

/**
 * Calls `listener` on every change to what `readSettingsState` reads, so
 * the Settings window is sent the state again: each setting it shows and the
 * trusted sites, which the store announces by key, Do Not Disturb through the
 * profiles' state, the mail check, the General page's own values, the
 * language shown, the page shown, the entitlement and its request out.
 */
export const onSettingsStateChange = (
  {
    settings,
    profiles,
    mail,
    pages,
    general,
    language,
    entitlement,
    licenseRequests,
  }: {
    settings: Pick<SettingsStore, "onChange">;
    profiles: Pick<Profiles, "onChange">;
    mail: Pick<MailPoller, "onChange">;
    pages: Pick<SettingsPages, "onChange">;
    general: Pick<GeneralPage, "onChange">;
    language: Pick<Language, "onChange">;
    entitlement: Pick<Entitlement, "onChange">;
    licenseRequests: Pick<LicenseRequests, "onChange">;
  },
  listener: () => void
) => {
  for (const key of [
    ...PAGE_SETTING_KEYS,
    "unifiedInbox",
    "trustedSites",
  ] as const) {
    settings.onChange(key, listener);
  }

  profiles.onChange(listener);
  mail.onChange(listener);
  pages.onChange(listener);
  general.onChange(listener);
  language.onChange(listener);
  entitlement.onChange(listener);
  licenseRequests.onChange(listener);
};
