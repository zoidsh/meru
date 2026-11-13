import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { rectSchema } from "../../core/records/rect.ts";
import { launcher } from "../../shared/channels/launcher.ts";
import { launcherSurface } from "../../shared/channels/surfaces.ts";
import { themePushes } from "../../shared/channels/theme.ts";
import { createClient } from "../client.ts";
import { Launcher } from "../features/launcher/launcher.tsx";
import { LauncherClientProvider } from "../features/launcher/use-launcher-client.ts";
import {
  createProfilesStore,
  ProfilesContext,
} from "../features/profiles/use-profiles.ts";
import {
  createSettingsStore,
  SettingsContext,
} from "../features/settings/use-setting.ts";
import { followTheme } from "../theme.ts";

import "../ui/globals.css";

const parseRect = (raw: string | null) => {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw ?? "null");
  } catch {
    parsed = null;
  }
  return rectSchema.safeParse(parsed).data;
};

const showLauncher = (query: URLSearchParams): ReactNode => {
  const client = createClient(window, launcherSurface);
  followTheme(document.documentElement, location.href, (listener) =>
    client.on(themePushes.changed, ({ theme }) => {
      listener(theme);
    })
  );
  const anchor = parseRect(query.get("anchor"));
  if (anchor === undefined) {
    client.send(launcher.close, {});
    return null;
  }
  return (
    <LauncherClientProvider client={client}>
      <SettingsContext value={createSettingsStore(client)}>
        <ProfilesContext value={createProfilesStore(client)}>
          <Launcher anchor={anchor} />
        </ProfilesContext>
      </SettingsContext>
    </LauncherClientProvider>
  );
};

/** What the page can show over the panes, by the `kind` its address names; each brings up its own client on its own surface and only the stores it reads. */
const overlays = new Map<string, (query: URLSearchParams) => ReactNode>([
  ["launcher", showLauncher],
]);

const query = new URL(location.href).searchParams;
const kind = query.get("kind");
const show = kind === null ? undefined : overlays.get(kind);
const root = document.querySelector("#root");

if (!root) {
  throw new Error("overlay.html has no #root to render into");
}

if (show === undefined) {
  throw new Error(`overlay.html has no overlay of kind ${String(kind)}`);
}

createRoot(root).render(<StrictMode>{show(query)}</StrictMode>);
