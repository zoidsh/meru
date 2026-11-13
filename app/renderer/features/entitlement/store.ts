import type { Unsubscribe } from "../../../core/ports.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import {
  entitlement as channels,
  entitlementPushes,
} from "../../../shared/channels/entitlement.ts";
import type { RendererSurface } from "../../../shared/channels/surfaces.ts";
import type { Client } from "../../client.ts";
import { createStore } from "../../store.ts";
import type { Store } from "../../store.ts";

const UNKNOWN: Entitlement = {
  expiresAt: null,
  kind: "unknown",
  source: "stored",
};

/** The page's copy of the entitlement: seeded once, then kept by the main process's pushes. */
export const createEntitlementStore = (
  client: Client<RendererSurface>
): Store<Entitlement> => {
  const seed = client.sendSync(channels.snapshot, {});
  const store = createStore<Entitlement>(seed.ok ? seed.value : UNKNOWN);
  client.on(entitlementPushes.changed, (entitlement) => {
    store.set(() => entitlement);
  });
  return store;
};

/** Keeps `data-entitlement` on `element` at the entitlement's kind, which is what the end-to-end suite reads. */
export const markEntitlement = (
  store: Store<Entitlement>,
  element: HTMLElement
): Unsubscribe => {
  const mark = () => {
    element.dataset.entitlement = store.get().kind;
  };
  mark();
  return store.subscribe(mark);
};
