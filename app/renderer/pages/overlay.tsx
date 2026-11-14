import type { ReactNode } from "react";

import { orientationSchema } from "../../core/records/layout.ts";
import { overlayKindSchema, overlays } from "../../shared/channels/surfaces.ts";
import type { OverlayKind } from "../../shared/channels/surfaces.ts";
import { createClient } from "../client.ts";
import type { Client } from "../client.ts";
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
import { TabDrag } from "../features/stage/tab-drag.tsx";
import { mountPage } from "../page.tsx";

import "../ui/globals.css";

/** What the page shows for each kind of overlay, given a client on that kind's surface from `overlays`, with only the stores it reads. */
const shows: {
  readonly [K in OverlayKind]: (
    client: Client<(typeof overlays)[K]>,
    query: URLSearchParams
  ) => ReactNode;
} = {
  launcher: (client, query) => (
    <LauncherClientProvider client={client}>
      <SettingsContext value={createSettingsStore(client)}>
        <ProfilesContext value={createProfilesStore(client)}>
          <Launcher
            split={orientationSchema.safeParse(query.get("split")).data}
          />
        </ProfilesContext>
      </SettingsContext>
    </LauncherClientProvider>
  ),
  tabDrag: (client, query) => {
    const tabId = query.get("tabId");
    return tabId === null ? null : (
      <TabDrag
        accent={query.get("accent") ?? undefined}
        appId={query.get("appId") ?? undefined}
        client={client}
        tabId={tabId}
        title={query.get("title") ?? undefined}
      />
    );
  },
};

const query = new URL(location.href).searchParams;
const kind = overlayKindSchema.safeParse(query.get("kind"));
if (!kind.success) {
  throw new Error(
    `overlay.html has no overlay of kind ${String(query.get("kind"))}`
  );
}

// Generic over the kind so a kind's client reaches its own entry of `shows`; indexed by the parsed union, the entry would have to take every overlay's client at once.
const render = <K extends OverlayKind>(
  shown: K,
  client: Client<(typeof overlays)[K]>
): ReactNode => shows[shown](client, query);

const client = createClient(window, overlays[kind.data]);

mountPage(client, render(kind.data, client));
