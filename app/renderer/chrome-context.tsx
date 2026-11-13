import { createContext, useContext } from "react";

import {
  profiles as profileChannels,
  profilesPushes,
} from "../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../shared/channels/profiles.ts";
import { stage, stagePushes } from "../shared/channels/stage.ts";
import type { StageSnapshot } from "../shared/channels/stage.ts";
import type { RendererSurface } from "../shared/channels/surfaces.ts";
import type { Settings } from "../shared/settings/registry.ts";
import type { Client } from "./client.ts";
import { createSettingsStore } from "./features/settings/use-setting.ts";
import { syncedStore, useStore } from "./store.ts";
import type { Store } from "./store.ts";

/** What every component of the chrome page reads: the client, and the page's copies of what main holds. */
export interface Chrome {
  readonly client: Client<RendererSurface>;
  readonly profiles: Store<ProfilesSnapshot | undefined>;
  readonly stage: Store<StageSnapshot | undefined>;
  readonly settings: Store<Settings>;
}

export const createChrome = (client: Client<RendererSurface>): Chrome => ({
  client,
  profiles: syncedStore(
    client,
    profileChannels.snapshot,
    profilesPushes.changed,
    undefined
  ),
  settings: createSettingsStore(client),
  stage: syncedStore(client, stage.snapshot, stagePushes.changed, undefined),
});

export const ChromeContext = createContext<Chrome | undefined>(undefined);

export const useChrome = (): Chrome => {
  const chrome = useContext(ChromeContext);
  if (chrome === undefined) {
    throw new Error("A chrome component needs a ChromeContext above it");
  }
  return chrome;
};

export const useClient = (): Client<RendererSurface> => useChrome().client;

const same = <T,>(value: T) => value;

/** The profiles, tabs and groups as main last pushed them; undefined until the first answer. */
export const useProfiles = (): ProfilesSnapshot | undefined =>
  useStore(useChrome().profiles, same);

/** The window's stage as main last pushed it: the panes, the dividers and the focused pane. */
export const useStage = (): StageSnapshot | undefined =>
  useStore(useChrome().stage, same);
