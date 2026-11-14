import { StrictMode } from "react";
import type { ReactElement, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { z } from "zod";

import type { Unsubscribe } from "../core/ports.ts";
import type {
  ChromeSurface,
  SettingsSurface,
} from "../shared/channels/surfaces.ts";
import { themePushes } from "../shared/channels/theme.ts";
import { ChromeProvider } from "./client-context.tsx";
import type { Client } from "./client.ts";
import {
  createProfilesStore,
  ProfilesContext,
} from "./features/profiles/use-profiles.ts";
import {
  createSettingsStore,
  SettingsContext,
} from "./features/settings/use-setting.ts";
import { SettingsClientProvider } from "./features/settings/use-settings-client.ts";
import {
  createSidebarStore,
  SidebarContext,
} from "./features/sidebar/use-sidebar.ts";
import { createStageStore, StageContext } from "./features/stage/use-stage.ts";
import {
  createUpdateStore,
  UpdateContext,
} from "./features/updater/use-update.ts";
import { followTheme } from "./theme.ts";

/** What a page needs of its client to follow the theme: every surface has the push. */
interface ThemeSource {
  readonly on: (
    channel: typeof themePushes.changed,
    listener: (payload: z.output<typeof themePushes.changed.payload>) => void
  ) => Unsubscribe;
}

/** Paints the page in its URL's theme, follows theme changes, and renders `node` into its `#root`. */
export const mountPage = (client: ThemeSource, node: ReactNode): void => {
  followTheme(document.documentElement, location.href, (listener) =>
    client.on(themePushes.changed, ({ theme }) => {
      listener(theme);
    })
  );
  const root = document.querySelector("#root");
  if (root === null) {
    throw new Error(`${location.pathname} has no #root to render into`);
  }
  createRoot(root).render(<StrictMode>{node}</StrictMode>);
};

/** The chrome page's client and the stores it reads, around `node`. */
export const chromeStores = (
  client: Client<ChromeSurface>,
  node: ReactNode
): ReactElement => (
  <ChromeProvider client={client}>
    <SettingsContext value={createSettingsStore(client)}>
      <ProfilesContext value={createProfilesStore(client)}>
        <StageContext value={createStageStore(client)}>
          <SidebarContext value={createSidebarStore(client)}>
            {node}
          </SidebarContext>
        </StageContext>
      </ProfilesContext>
    </SettingsContext>
  </ChromeProvider>
);

/** The settings window's client and the stores it reads, around `node`. */
export const settingsStores = (
  client: Client<SettingsSurface>,
  node: ReactNode
): ReactElement => (
  <SettingsClientProvider client={client}>
    <SettingsContext value={createSettingsStore(client)}>
      <ProfilesContext value={createProfilesStore(client)}>
        <UpdateContext value={createUpdateStore(client)}>{node}</UpdateContext>
      </ProfilesContext>
    </SettingsContext>
  </SettingsClientProvider>
);
