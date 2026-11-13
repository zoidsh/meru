import { createContext } from "react";

import type { Sidebar } from "../../../core/engines/sidebar.ts";
import { sidebar, sidebarPushes } from "../../../shared/channels/sidebar.ts";
import { syncedStore, useWholeStore } from "../../store.ts";
import type { Store, SyncSource } from "../../store.ts";

const HIDDEN: Sidebar = { kind: "hidden" };

/** The page's copy of the selected profile's sidebar, hidden until main says otherwise. */
export const createSidebarStore = (
  client: SyncSource<
    (typeof sidebar.snapshot)["result"],
    (typeof sidebarPushes.changed)["payload"]
  >
): Store<Sidebar> =>
  syncedStore(client, sidebar.snapshot, sidebarPushes.changed, HIDDEN);

export const SidebarContext = createContext<Store<Sidebar> | undefined>(
  undefined
);

/** The selected profile's sidebar as main last pushed it. */
export const useSidebar = (): Sidebar =>
  useWholeStore(SidebarContext, "useSidebar");
