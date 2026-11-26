import type { ElectronApplication } from "@playwright/test";

import { expect } from "./app.ts";

/** One of GitHub's releases as its API lists it, with what Meru reads. */
interface GitHubRelease {
  id: number;
  tag_name: string;
  published_at: string;
  body: string | null;
  prerelease: boolean;
}

export const githubRelease = (
  id: number,
  tag: string,
  day: string,
  body: string | null,
  prerelease = false
): GitHubRelease => ({
  id,
  tag_name: tag,
  published_at: `${day}T12:00:00Z`,
  body,
  prerelease,
});

/** A script URL, spelled so that nothing reads it as one to run. */
export const SCRIPT_URL = ["javascript", "alert(1)"].join(":");

/** Where the notes of 4.0.2 link to. */
export const NOTES_LINK = "https://github.com/zoidsh/meru/issues/1";

export const OLDER_NOTES = `## Features

- Each profile keeps its own window size and place.
- Downloads show in the titlebar while they run.

## Fixes

- The unread count no longer counts muted conversations.
- Printing a message keeps its images.`;

/**
 * Newest first, as GitHub lists them, around the 4.0.0-dev.0 the suite's
 * build runs: a beta ahead of it, and enough older releases to scroll.
 */
export const GITHUB_RELEASES: GitHubRelease[] = [
  githubRelease(
    9,
    "v4.1.0-beta.1",
    "2026-11-22",
    "## Beta\n\n- Try the new inbox.",
    true
  ),
  githubRelease(
    8,
    "v4.0.2",
    "2026-11-18",
    `## Fixes

- Press <kbd>Cmd</kbd> <kbd>K</kbd> to search again. See [the issue](${NOTES_LINK}).
- A **bold** fix and \`code\`.

<script>document.title = "ran"</script>
<img src="https://example.com/tracker.png" alt="tracker">
![screenshot](https://example.com/shot.png)
[A script link](${SCRIPT_URL})`
  ),
  githubRelease(7, "v4.0.1", "2026-11-10", OLDER_NOTES),
  githubRelease(
    6,
    "v4.0.0-dev.0",
    "2026-11-01",
    "The build the suite runs.",
    true
  ),
  githubRelease(5, "v3.9.0", "2026-10-20", OLDER_NOTES),
  githubRelease(4, "v3.8.0", "2026-10-01", OLDER_NOTES),
  githubRelease(3, "v3.7.0", "2026-09-10", OLDER_NOTES),
  githubRelease(2, "v3.6.0", "2026-08-20", null),
];

/** The tags What's new lists on the Stable channel, in order. */
export const STABLE_TAGS = [
  "v4.0.2",
  "v4.0.1",
  "v4.0.0-dev.0",
  "v3.9.0",
  "v3.8.0",
  "v3.7.0",
  "v3.6.0",
];

/**
 * Sets what the suite's stand-in for GitHub answers each request with from
 * now on: a list, or `"fail"`; `hold` keeps every answer back until set
 * `false`.
 */
export const answerReleases = async (
  app: ElectronApplication,
  answer: unknown,
  hold = false
) => {
  // The stand-in exists once main has wired the Settings window, a moment
  // after the launch returns.
  await expect
    .poll(() => app.evaluate(() => Reflect.has(globalThis, "meruTestReleases")))
    .toBe(true);
  await app.evaluate(
    (_electron, [sent, held]) => {
      const releases = Reflect.get(globalThis, "meruTestReleases") as {
        answer: unknown;
        hold: boolean;
      };

      releases.answer = sent;
      releases.hold = held;
    },
    [answer, hold] as const
  );
};

/** How many times the stand-in was asked. */
export const releasesAsked = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestReleases") as { requests: number })
        .requests
  );
