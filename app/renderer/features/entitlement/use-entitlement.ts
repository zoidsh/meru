import { createContext, useContext } from "react";

import { canUse } from "../../../core/entitlement/gate.ts";
import type { Gate, GatedFeature } from "../../../core/entitlement/gate.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import {
  entitlement as channels,
  entitlementPushes,
} from "../../../shared/channels/entitlement.ts";
import type { SettingsSurface } from "../../../shared/channels/surfaces.ts";
import type { Client } from "../../client.ts";
import { createStore, useStore } from "../../store.ts";
import type { Store } from "../../store.ts";

const UNKNOWN: Entitlement = {
  expiresAt: null,
  kind: "unknown",
  source: "stored",
};

/** The page's copy of the entitlement, which gates as free until main answers. */
export const createEntitlementStore = (
  client: Client<SettingsSurface>
): Store<Entitlement> => {
  const seed = client.sendSync(channels.snapshot, {});
  const store = createStore<Entitlement>(seed.ok ? seed.value : UNKNOWN);
  client.on(entitlementPushes.changed, (next) => {
    store.set(() => next);
  });
  return store;
};

export const EntitlementContext = createContext<Store<Entitlement> | undefined>(
  undefined
);

const same = <T>(value: T) => value;

export const useEntitlement = (): Entitlement => {
  const store = useContext(EntitlementContext);
  if (store === undefined) {
    throw new Error("useEntitlement needs an EntitlementContext above it");
  }
  return useStore(store, same);
};

// A trial that ends while the page is open arrives as a change of entitlement, so the time the page opened is as good as the time now.
const opened = Date.now();

/** What the gate answers for a Pro action, `profiles` existing before it. */
export const useGate = (feature: GatedFeature, profiles: number): Gate =>
  canUse(useEntitlement(), feature, { now: opened, profiles });
