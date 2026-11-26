import { net } from "electron";
import { delay } from "es-toolkit";

import { RELEASES_API_URL } from "#core/releases.ts";

/** A bound of its own, so a list that never comes leaves What's new failed, not loading. */
const LIST_TIMEOUT_MS = 20_000;

/**
 * GitHub's list of Meru's releases, as its JSON parses; what it holds is
 * checked by the caller. Rejects when no list came.
 */
export interface ReleasesSource {
  list: () => Promise<unknown>;
}

/**
 * Asks GitHub with no cookies or credentials of any session, so nothing about
 * the person or the install goes with the request beyond what any HTTPS
 * request carries.
 */
export const createGitHubReleases = (): ReleasesSource => ({
  list: async () => {
    const response = await net.fetch(RELEASES_API_URL, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub answered the list of releases with ${response.status}`
      );
    }

    return (await response.json()) as unknown;
  },
});

/** What a test sets on the main process's global under `meruTestReleases`. */
export interface CapturedReleases {
  /** The list each request answers with, or `"fail"`; failing until set. */
  answer: unknown;
  /** Holds every answer back until a test sets it `false`. */
  hold: boolean;
  requests: number;
}

/**
 * The end-to-end build's: answers with what the test set, so no test reaches
 * GitHub.
 */
export const createCapturedReleases = (): ReleasesSource => {
  const captured: CapturedReleases = {
    answer: "fail",
    hold: false,
    requests: 0,
  };

  Reflect.set(globalThis, "meruTestReleases", captured);

  const settle = async () => {
    while (captured.hold) {
      // oxlint-disable-next-line no-await-in-loop -- waits for the test to let go
      await delay(50);
    }

    if (captured.answer === "fail") {
      throw new Error("The suite's releases answered with a failure");
    }

    return captured.answer;
  };

  return {
    list: () => {
      captured.requests += 1;

      return settle();
    },
  };
};
