import type { Entitlement } from "../../../core/records/entitlement.ts";
import {
  entitlement as channels,
  entitlementPushes,
} from "../../../shared/channels/entitlement.ts";
import type { RendererSurface } from "../../../shared/channels/surfaces.ts";
import type { Client } from "../../client.ts";
import { syncedStore } from "../../store.ts";
import type { Store } from "../../store.ts";

const UNKNOWN: Entitlement = {
  expiresAt: null,
  kind: "unknown",
  source: "stored",
};

/** The page's copy of the entitlement. */
export const createEntitlementStore = (
  client: Client<RendererSurface>
): Store<Entitlement> =>
  syncedStore(client, channels.snapshot, entitlementPushes.changed, UNKNOWN);
