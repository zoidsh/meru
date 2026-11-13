import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { chromeSurface } from "../../shared/channels/surfaces.ts";
import { themePushes } from "../../shared/channels/theme.ts";
import { ChromeProvider } from "../client-context.tsx";
import { createClient } from "../client.ts";
import { LauncherButton } from "../features/launcher/launcher-button.tsx";
import {
  createProfilesStore,
  ProfilesContext,
} from "../features/profiles/use-profiles.ts";
import {
  createSettingsStore,
  SettingsContext,
} from "../features/settings/use-setting.ts";
import { Sidebar } from "../features/sidebar/sidebar.tsx";
import {
  createSidebarStore,
  SidebarContext,
} from "../features/sidebar/use-sidebar.ts";
import { Dividers } from "../features/stage/dividers.tsx";
import { createStageStore, StageContext } from "../features/stage/use-stage.ts";
import { Titlebar } from "../features/titlebar/titlebar.tsx";
import { followTheme } from "../theme.ts";

import "../ui/globals.css";

const client = createClient(window, chromeSurface);

followTheme(document.documentElement, location.href, (listener) =>
  client.on(themePushes.changed, ({ theme }) => {
    listener(theme);
  })
);

const root = document.querySelector("#root");

if (!root) {
  throw new Error("chrome.html has no #root to render into");
}

createRoot(root).render(
  <StrictMode>
    <ChromeProvider client={client}>
      <SettingsContext value={createSettingsStore(client)}>
        <ProfilesContext value={createProfilesStore(client)}>
          <StageContext value={createStageStore(client)}>
            <SidebarContext value={createSidebarStore(client)}>
              <div className="bg-background text-foreground flex h-full flex-col">
                <Titlebar trailing={<LauncherButton place="titlebar" />} />
                <div className="flex min-h-0 flex-1">
                  <Sidebar
                    launcher={(size) => <LauncherButton place={size} />}
                  />
                </div>
              </div>
              <Dividers />
            </SidebarContext>
          </StageContext>
        </ProfilesContext>
      </SettingsContext>
    </ChromeProvider>
  </StrictMode>
);
