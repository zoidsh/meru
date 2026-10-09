import { ipc } from "@meru/shared/renderer/ipc";
import { setAccountColorIndicator } from "./account-color-indicator";

ipc.renderer.on("workspaceApp.accountColorChanged", (_event, color) => {
  setAccountColorIndicator(color);
});
