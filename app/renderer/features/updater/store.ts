import type { Unsubscribe } from "../../../core/ports.ts";
import type { UpdateState } from "../../../core/records/update.ts";
import type { RendererSurface } from "../../../shared/channels/surfaces.ts";
import {
  updater as channels,
  updaterPushes,
} from "../../../shared/channels/updater.ts";
import type { Client } from "../../client.ts";
import { createStore } from "../../store.ts";
import type { Store } from "../../store.ts";

/** The page's copy of the update state: seeded once, then kept by the main process's pushes. */
export const createUpdateStore = (
  client: Client<RendererSurface>
): Store<UpdateState> => {
  const seed = client.sendSync(channels.snapshot, {});
  const store = createStore<UpdateState>(
    seed.ok ? seed.value : { kind: "idle" }
  );
  client.on(updaterPushes.changed, (state) => {
    store.set(() => state);
  });
  return store;
};

/** Keeps `data-update` on `element` at the update state's kind, which is what the end-to-end suite reads. */
export const markUpdate = (
  store: Store<UpdateState>,
  element: HTMLElement
): Unsubscribe => {
  const mark = () => {
    element.dataset.update = store.get().kind;
  };
  mark();
  return store.subscribe(mark);
};
