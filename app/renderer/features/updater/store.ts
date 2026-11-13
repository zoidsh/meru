import type { UpdateState } from "../../../core/records/update.ts";
import type { RendererSurface } from "../../../shared/channels/surfaces.ts";
import {
  updater as channels,
  updaterPushes,
} from "../../../shared/channels/updater.ts";
import type { Client } from "../../client.ts";
import { syncedStore } from "../../store.ts";
import type { Store } from "../../store.ts";

/** The page's copy of the update state. */
export const createUpdateStore = (
  client: Client<RendererSurface>
): Store<UpdateState> =>
  syncedStore(client, channels.snapshot, updaterPushes.changed, {
    kind: "idle",
  });
