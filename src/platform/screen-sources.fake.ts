import type { ScreenCaptureStatus, ScreenSource } from "#core/screen-picker.ts";

import type { ScreenSources } from "./screen-sources.ts";

/**
 * Sources a test lists and takes away, with each listing held until the
 * test settles it, so the card's loading state can be seen.
 */
export const fakeScreenSources = ({
  status = "granted",
  sources = [],
}: {
  status?: ScreenCaptureStatus;
  sources?: ScreenSource[];
} = {}) => {
  const state = {
    status,
    sources,
    /** Each listing still waiting, oldest first. */
    waiting: [] as { resolve: () => void; reject: () => void }[],
    listed: 0,
    settingsOpened: 0,
  };
  const screenSources: ScreenSources = {
    status: () => state.status,
    list: () => {
      state.listed += 1;

      const { promise, resolve, reject } =
        Promise.withResolvers<ScreenSource[]>();

      state.waiting.push({
        resolve: () => {
          resolve([...state.sources]);
        },
        reject: () => {
          reject(new Error("The fake fails to list"));
        },
      });

      return promise;
    },
    has: (id) =>
      Promise.resolve(state.sources.some((source) => source.id === id)),
    openSettings: () => {
      state.settingsOpened += 1;

      return Promise.resolve();
    },
  };

  return {
    screenSources,
    state,
    /** Answers every listing waiting with the sources as they are now. */
    settle: () => {
      for (const listing of state.waiting.splice(0)) {
        listing.resolve();
      }
    },
    failListing: () => {
      for (const listing of state.waiting.splice(0)) {
        listing.reject();
      }
    },
  };
};
