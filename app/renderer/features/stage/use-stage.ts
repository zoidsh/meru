import { createContext, useContext } from "react";

import { stage, stagePushes } from "../../../shared/channels/stage.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import { syncedStore, useStore } from "../../store.ts";
import type { Store, SyncSource } from "../../store.ts";

/** The page's copy of its window's stage; undefined until main first answers. */
export const createStageStore = (
  client: SyncSource<
    (typeof stage.snapshot)["result"],
    (typeof stagePushes.changed)["payload"]
  >
): Store<StageSnapshot | undefined> =>
  syncedStore(client, stage.snapshot, stagePushes.changed, undefined);

export const StageContext = createContext<
  Store<StageSnapshot | undefined> | undefined
>(undefined);

const same = <T>(value: T) => value;

/** The window's stage as main last pushed it: the panes, the dividers and the focused pane. */
export const useStage = (): StageSnapshot | undefined => {
  const store = useContext(StageContext);
  if (store === undefined) {
    throw new Error("useStage needs a StageContext above it");
  }
  return useStore(store, same);
};
