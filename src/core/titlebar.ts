import type { Platform } from "./platform.ts";

/**
 * Where the titlebar's first button, the sidebar toggle, starts: on macOS
 * clear of the traffic lights, elsewhere 8px from the window's edge. The
 * narrow sidebar takes its width from it, so the page lines up with that
 * button.
 */
export const titlebarStart = (platform: Platform) =>
  platform === "darwin" ? 80 : 8;
