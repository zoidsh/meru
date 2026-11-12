import { contextBridge } from "electron";

import { BRIDGE_KEY } from "../../shared/bridge.ts";
import type { RendererBridge } from "../../shared/bridge.ts";

export const exposeBridge = (bridge: RendererBridge): void => {
  contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
};
