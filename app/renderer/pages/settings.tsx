import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { settingsSurface } from "../../shared/channels/surfaces.ts";
import { themePushes } from "../../shared/channels/theme.ts";
import { createClient } from "../client.ts";
import {
  createEntitlementStore,
  EntitlementContext,
} from "../features/entitlement/use-entitlement.ts";
import {
  createProfilesStore,
  ProfilesContext,
} from "../features/profiles/use-profiles.ts";
import { SettingsWindow } from "../features/settings/settings-window.tsx";
import {
  createSettingsStore,
  SettingsContext,
} from "../features/settings/use-setting.ts";
import { SettingsClientProvider } from "../features/settings/use-settings-client.ts";
import {
  createUpdateStore,
  UpdateContext,
} from "../features/updater/use-update.ts";
import { followTheme } from "../theme.ts";

import "../ui/globals.css";

const client = createClient(window, settingsSurface);

followTheme(document.documentElement, location.href, (listener) =>
  client.on(themePushes.changed, ({ theme }) => {
    listener(theme);
  })
);

const root = document.querySelector("#root");

if (!root) {
  throw new Error("settings.html has no #root to render into");
}

createRoot(root).render(
  <StrictMode>
    <SettingsClientProvider client={client}>
      <SettingsContext value={createSettingsStore(client)}>
        <ProfilesContext value={createProfilesStore(client)}>
          <EntitlementContext value={createEntitlementStore(client)}>
            <UpdateContext value={createUpdateStore(client)}>
              <SettingsWindow />
            </UpdateContext>
          </EntitlementContext>
        </ProfilesContext>
      </SettingsContext>
    </SettingsClientProvider>
  </StrictMode>
);
