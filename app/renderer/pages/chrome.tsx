import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { stage, stagePushes } from "../../shared/channels/stage.ts";
import { rendererSurface } from "../../shared/channels/surfaces.ts";
import { createClient } from "../client.ts";
import {
  createSettingsStore,
  SettingsContext,
} from "../features/settings/use-setting.ts";
import { Dividers } from "../features/stage/dividers.tsx";
import { syncedStore } from "../store.ts";
import { followTheme } from "../theme.ts";

followTheme(document.documentElement, location.href, (query) =>
  matchMedia(query)
);

const client = createClient(window, rendererSurface);
const store = syncedStore(
  client,
  stage.snapshot,
  stagePushes.changed,
  undefined
);
const settings = createSettingsStore(client);

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
