import { BRIDGE_KEY } from "../shared/bridge.ts";
import type { RendererBridge } from "../shared/bridge.ts";

/** The renderer's one way to the main process. IPC channels arrive with the first feature that needs one. */
export interface Client {
  readonly platform: string;
}

const isBridge = (value: unknown): value is RendererBridge =>
  typeof value === "object" &&
  value !== null &&
  "platform" in value &&
  typeof value.platform === "string";

export const createClient = (global: object): Client => {
  const bridge: unknown = Reflect.get(global, BRIDGE_KEY);
  if (!isBridge(bridge)) {
    throw new Error(
      `window.${BRIDGE_KEY} is missing; was the page loaded without the renderer preload?`
    );
  }
  return { platform: bridge.platform };
};
