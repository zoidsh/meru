import { ipc } from "@meru/shared/renderer/ipc";
import { initAccountColorIndicator } from "./account-color-indicator";

ipc.renderer.on("googleApp.initAccountColorIndicator", (_event, color) => {
  initAccountColorIndicator(color);
});
