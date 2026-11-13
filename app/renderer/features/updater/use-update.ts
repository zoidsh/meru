import { createContext, useContext } from "react";

import type { UpdateState } from "../../../core/records/update.ts";
import type { SettingsSurface } from "../../../shared/channels/surfaces.ts";
import {
  updater as channels,
  updaterPushes,
} from "../../../shared/channels/updater.ts";
import type { Client } from "../../client.ts";
import { createStore, useStore } from "../../store.ts";
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

const same = <T>(value: T) => value;

export const useUpdate = (): UpdateState => {
  const store = useContext(UpdateContext);
  if (store === undefined) {
    throw new Error("useUpdate needs an UpdateContext above it");
  }
  return useStore(store, same);
};
