import { ipc } from "@meru/shared/renderer/ipc";
import type { ExtensionActionState } from "@meru/shared/types";
import { create } from "zustand";

/**
 * The extension buttons this window's titlebar shows. It lives outside
 * `stores.ts` because the workspace app windows draw them too, and everything
 * in there is the main window's.
 */
export const useExtensionActionsStore = create<{
  actions: ExtensionActionState[];
}>(() => ({
  actions: [],
}));

ipc.renderer.on("extensions.actionsChanged", (_event, actions) => {
  useExtensionActionsStore.setState({ actions });
});

// Extensions finish loading on their own schedule, and a window can open long
// after they did, so what is already there is asked for rather than waited for
void ipc.main.invoke("extensions.getActions").then((actions) => {
  useExtensionActionsStore.setState({ actions });
});
