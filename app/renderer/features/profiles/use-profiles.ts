import { createContext } from "react";

import { profiles, profilesPushes } from "../../../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../../../shared/channels/profiles.ts";
import { syncedStore, useWholeStore } from "../../store.ts";
import type { Store, SyncSource } from "../../store.ts";

/** The page's copy of the profiles, tabs and groups; undefined until main first answers. */
export const createProfilesStore = (
  client: SyncSource<
    (typeof profiles.snapshot)["result"],
    (typeof profilesPushes.changed)["payload"]
  >
): Store<ProfilesSnapshot | undefined> =>
  syncedStore(client, profiles.snapshot, profilesPushes.changed, undefined);

export const ProfilesContext = createContext<
  Store<ProfilesSnapshot | undefined> | undefined
>(undefined);

/** The profiles, tabs and groups as main last pushed them; undefined until the first answer. */
export const useProfiles = (): ProfilesSnapshot | undefined =>
  useWholeStore(ProfilesContext, "useProfiles");
