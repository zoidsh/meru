import type { DisplayMediaStreams, ScreenSources } from "./screen-sources.ts";

/**
 * For a run under the background flag, which shares one desktop with other
 * automated sessions: a system picker or a Screen Recording prompt would
 * land on that desktop, so nothing asks the system. Listing fails, which
 * the picker shows as it shows any failure, and no session gets macOS's
 * own picker.
 */
export const withheldScreenSources = (): {
  sources: ScreenSources;
  streams: DisplayMediaStreams;
} => ({
  sources: {
    status: () => "unknown",
    list: () =>
      Promise.reject(
        new Error("Screen sources are not listed in a background run")
      ),
    has: () => Promise.resolve(false),
    openSettings: () => Promise.resolve(),
  },
  streams: {
    video: (source) => source,
    systemPicker: () => false,
  },
});
