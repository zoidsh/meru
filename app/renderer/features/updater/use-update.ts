import { createContext } from "react";

import type { UpdateState } from "../../../core/records/update.ts";
import type { SettingsSurface } from "../../../shared/channels/surfaces.ts";
import {
  updater as channels,
  updaterPushes,
} from "../../../shared/channels/updater.ts";
import type { Client } from "../../client.ts";
import { createStore, useWholeStore } from "../../store.ts";
import type { Store } from "../../store.ts";

const IDLE: UpdateState = { kind: "idle" };

/** The page's copy of the update state, idle until main answers. */
export const createUpdateStore = (
  client: Client<SettingsSurface>
): Store<UpdateState> => {
  const seed = client.sendSync(channels.snapshot, {});
  const store = createStore<UpdateState>(seed.ok ? seed.value : IDLE);
  client.on(updaterPushes.changed, (next) => {
    store.set(() => next);
  });
  return store;
};

export const UpdateContext = createContext<Store<UpdateState> | undefined>(
  undefined
);

export const useUpdate = (): UpdateState =>
  useWholeStore(UpdateContext, "useUpdate");
