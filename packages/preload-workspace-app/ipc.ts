import { ipc } from "@meru/shared/renderer/ipc";
import { initAccountColorIndicator } from "./account-color-indicator";

ipc.renderer.on("workspaceApp.initAccountColorIndicator", (_event, color) => {
  initAccountColorIndicator(color);
});
