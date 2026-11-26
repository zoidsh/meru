import type { UpdateChannel } from "./updates.ts";

/**
 * GitHub's public list of Meru's releases, newest first, which What's new
 * reads with no credentials: only what any HTTPS request carries.
 */
export const RELEASES_API_URL =
  "https://api.github.com/repos/zoidsh/meru/releases";

/** One of Meru's releases as GitHub lists it. */
export interface Release {
  /** As tagged, such as `v4.0.1`. */
  tag: string;
  /** When it was published, in milliseconds. */
  publishedAt: number;
  /** Its notes, Markdown written by Meru's maintainers but read as untrusted. */
  notes: string;
  prerelease: boolean;
}

/** A release as What's new lists it. */
export interface ShownRelease {
  tag: string;
  publishedAt: number;
  notes: string;
  /** The version running now. */
  current: boolean;
}

/** The tag a version is released under. */
export const releaseTag = (version: string) => `v${version}`;

/**
 * The releases What's new lists, newest first as GitHub has them: a beta only
 * on the Beta channel, except the one running.
 */
export const shownReleases = (
  releases: readonly Release[],
  channel: UpdateChannel,
  runningVersion: string
): ShownRelease[] => {
  const running = releaseTag(runningVersion);

  return releases
    .filter(
      (release) =>
        channel === "beta" || !release.prerelease || release.tag === running
    )
    .map(({ tag, publishedAt, notes }) => ({
      tag,
      publishedAt,
      notes,
      current: tag === running,
    }));
};

/** A link in the notes that may leave for the default browser. */
export const isReleaseLink = (href: unknown): href is string => {
  const url = typeof href === "string" ? URL.parse(href) : null;

  return (
    (url?.protocol === "https:" || url?.protocol === "http:") &&
    !url.username &&
    !url.password
  );
};
