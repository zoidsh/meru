import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { stage, stagePushes } from "../../shared/channels/stage.ts";
import type { StageSnapshot } from "../../shared/channels/stage.ts";
import { rendererSurface } from "../../shared/channels/surfaces.ts";
import { createClient } from "../client.ts";
import {
  createEntitlementStore,
  markEntitlement,
} from "../features/entitlement/store.ts";
import {
  createSettingsStore,
  SettingsContext,
} from "../features/settings/use-setting.ts";
import { createUpdateStore, markUpdate } from "../features/updater/store.ts";
import { Dividers } from "../stage/dividers.tsx";
import { createStore } from "../store.ts";

const client = createClient(window, rendererSurface);
const seed = client.sendSync(stage.snapshot, {});
const store = createStore<StageSnapshot | undefined>(
  seed.ok ? seed.value : undefined
);
client.on(stagePushes.changed, (snapshot) => {
  store.set(() => snapshot);
});
const settings = createSettingsStore(client);
markEntitlement(createEntitlementStore(client), document.documentElement);
markUpdate(createUpdateStore(client), document.documentElement);

const root = document.querySelector("#root");

if (!root) {
  throw new Error("chrome.html has no #root to render into");
}

createRoot(root).render(
  <StrictMode>
    <SettingsContext value={settings}>
      <Dividers client={client} store={store} />
    </SettingsContext>
  </StrictMode>
);
