/** What `preload/renderer` exposes to Meru's own pages as `window.meru`. */
export interface RendererBridge {
  readonly platform: string;
}

export const BRIDGE_KEY = "meru";
