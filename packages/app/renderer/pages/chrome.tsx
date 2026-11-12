import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { stage, stagePushes } from "../../shared/channels/stage.ts";
import { rendererSurface } from "../../shared/channels/surfaces.ts";
import type { StageSnapshot } from "../../shared/stage.ts";
import { createClient } from "../client.ts";
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

const root = document.querySelector("#root");

if (!root) {
  throw new Error("chrome.html has no #root to render into");
}

createRoot(root).render(
  <StrictMode>
    <Dividers client={client} store={store} />
  </StrictMode>
);
