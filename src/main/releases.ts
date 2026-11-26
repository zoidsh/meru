import { z } from "zod/mini";

import type { Release } from "#core/releases.ts";
import type { ReleasesSource } from "#platform/releases.ts";

/** GitHub caps a release's body near this; anything longer is no release of ours. */
const MAX_NOTES_LENGTH = 200_000;

const GITHUB_RELEASE = z.object({
  tag_name: z.string().check(z.minLength(1), z.maxLength(100)),
  published_at: z.string(),
  body: z.nullable(z.string().check(z.maxLength(MAX_NOTES_LENGTH))),
  prerelease: z.boolean(),
});

/** Each entry that reads as a published release; an answer that is no list reads as none. */
const readReleases = (answer: unknown): Release[] | undefined => {
  if (!Array.isArray(answer)) {
    return undefined;
  }

  return answer.flatMap((entry: unknown) => {
    const parsed = GITHUB_RELEASE.safeParse(entry);
    const publishedAt = parsed.success
      ? Date.parse(parsed.data.published_at)
      : Number.NaN;

    return parsed.success && Number.isFinite(publishedAt)
      ? [
          {
            tag: parsed.data.tag_name,
            publishedAt,
            notes: parsed.data.body ?? "",
            prerelease: parsed.data.prerelease,
          },
        ]
      : [];
  });
};

/**
 * Meru's releases for What's new, asked of GitHub once a run: the first list
 * that comes is kept, a failure is not, and a request while one is out waits
 * for that one.
 */
export const createReleases = ({
  source,
  log,
}: {
  source: ReleasesSource;
  log: (message: string) => void;
}) => {
  let kept: Release[] | undefined;
  let asking: Promise<Release[]> | undefined;

  const ask = async () => {
    let answer: unknown;

    try {
      answer = await source.list();
    } catch (error) {
      log(
        `Meru's releases were not listed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error("Meru's releases were not listed", { cause: error });
    }

    const releases = readReleases(answer);

    if (!releases) {
      // What GitHub sent is not ours to log.
      log("Meru's releases were not listed: the answer was no list");
      throw new Error("Meru's releases were not listed");
    }

    kept = releases;

    return releases;
  };

  return {
    list: async (): Promise<Release[]> => {
      if (kept) {
        return kept;
      }

      asking ??= ask().finally(() => {
        asking = undefined;
      });

      return await asking;
    },
  };
};

export type Releases = ReturnType<typeof createReleases>;
