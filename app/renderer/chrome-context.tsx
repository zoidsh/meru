import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { Sidebar } from "../core/engines/sidebar.ts";
import {
  profiles as profileChannels,
  profilesPushes,
} from "../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../shared/channels/profiles.ts";
import { sidebar, sidebarPushes } from "../shared/channels/sidebar.ts";
import { stage, stagePushes } from "../shared/channels/stage.ts";
import type { StageSnapshot } from "../shared/channels/stage.ts";
import type { RendererSurface } from "../shared/channels/surfaces.ts";
import type { Settings } from "../shared/settings/registry.ts";
import type { Client } from "./client.ts";
import {
  createSettingsStore,
  SettingsContext,
} from "./features/settings/use-setting.ts";
import { syncedStore, useStore } from "./store.ts";
import type { Store } from "./store.ts";

/** What every component of a renderer page reads: the client, and the page's copies of what main holds. */
export interface Chrome {
  readonly client: Client<RendererSurface>;
  readonly profiles: Store<ProfilesSnapshot | undefined>;
  readonly stage: Store<StageSnapshot | undefined>;
  readonly sidebar: Store<Sidebar>;
  readonly settings: Store<Settings>;
}

const HIDDEN: Sidebar = { kind: "hidden" };

export const createChrome = (client: Client<RendererSurface>): Chrome => ({
  client,
  profiles: syncedStore(
    client,
    profileChannels.snapshot,
    profilesPushes.changed,
    undefined
  ),
  settings: createSettingsStore(client),
  sidebar: syncedStore(client, sidebar.snapshot, sidebarPushes.changed, HIDDEN),
  stage: syncedStore(client, stage.snapshot, stagePushes.changed, undefined),
});

const ChromeContext = createContext<Chrome | undefined>(undefined);

export const ChromeProvider = ({
  chrome,
  children,
}: {
  readonly chrome: Chrome;
  readonly children: ReactNode;
}) => (
  <ChromeContext value={chrome}>
    <SettingsContext value={chrome.settings}>{children}</SettingsContext>
  </ChromeContext>
);

export const useChrome = (): Chrome => {
  const chrome = useContext(ChromeContext);
  if (chrome === undefined) {
    throw new Error("A chrome component needs a ChromeProvider above it");
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

/** The selected profile's strip, hidden until main says otherwise. */
export const useSidebar = (): Sidebar => useStore(useChrome().sidebar, same);
