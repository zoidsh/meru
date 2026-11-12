import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createClient } from "../client.ts";
import { createStore, useStore } from "../store.ts";
import type { Store } from "../store.ts";

interface ChromeState {
  readonly platform: string;
}

const Chrome = ({ store }: { store: Store<ChromeState> }) => {
  const platform = useStore(store, (state) => state.platform);
  return (
    <main>
      <h1>Meru</h1>
      <p>Running on {platform}</p>
    </main>
  );
};

const client = createClient(window);
const store = createStore<ChromeState>({ platform: client.platform });
const root = document.querySelector("#root");

if (!root) {
  throw new Error("chrome.html has no #root to render into");
}

createRoot(root).render(
  <StrictMode>
    <Chrome store={store} />
  </StrictMode>
);
