import { describe, expect, it } from "vitest";

import type { ReleasesSource } from "#platform/releases.ts";

import { createReleases } from "./releases.ts";

const GITHUB = [
  {
    id: 2,
    tag_name: "v4.0.1",
    published_at: "2026-11-20T10:00:00Z",
    body: "## Fixes\n\n- One",
    prerelease: false,
  },
  {
    id: 1,
    tag_name: "v4.0.0",
    published_at: "2026-11-01T10:00:00Z",
    body: null,
    prerelease: false,
  },
];

/** A source answering each request in turn, rejecting with `"fail"`. */
const sourceOf = (...answers: unknown[]) => {
  const asked = { count: 0 };
  const source: ReleasesSource = {
    list: () => {
      const answer = answers[Math.min(asked.count, answers.length - 1)];

      asked.count += 1;

      return answer === "fail"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(answer);
    },
  };

  return { source, asked };
};

const setup = (...answers: unknown[]) => {
  const { source, asked } = sourceOf(...answers);
  const logs: string[] = [];

  return {
    releases: createReleases({ source, log: (line) => logs.push(line) }),
    asked,
    logs,
  };
};

describe(createReleases, () => {
  it("reads GitHub's list, newest first, a release with no notes as empty notes", async () => {
    const { releases } = setup(GITHUB);

    await expect(releases.list()).resolves.toStrictEqual([
      {
        tag: "v4.0.1",
        publishedAt: Date.parse("2026-11-20T10:00:00Z"),
        notes: "## Fixes\n\n- One",
        prerelease: false,
      },
      {
        tag: "v4.0.0",
        publishedAt: Date.parse("2026-11-01T10:00:00Z"),
        notes: "",
        prerelease: false,
      },
    ]);
  });

  it("asks once a run once a list came, and a request while one is out waits for it", async () => {
    const { releases, asked } = setup(GITHUB);

    await Promise.all([releases.list(), releases.list()]);
    await releases.list();

    expect(asked.count).toBe(1);
  });

  it("keeps no failure, so Try again asks again", async () => {
    const { releases, asked, logs } = setup("fail", GITHUB);

    await expect(releases.list()).rejects.toThrow(
      "Meru's releases were not listed"
    );
    await expect(releases.list()).resolves.toHaveLength(2);
    expect(asked.count).toBe(2);
    expect(logs).toStrictEqual(["Meru's releases were not listed: offline"]);
  });

  it("drops an entry that is no release and fails an answer that is no list, logging none of it", async () => {
    const { releases } = setup([
      GITHUB[0],
      {
        tag_name: "v3.9.0",
        published_at: "not a date",
        body: "",
        prerelease: false,
      },
      { tag_name: 7 },
      "<html>",
    ]);

    await expect(releases.list()).resolves.toHaveLength(1);

    const failing = setup({
      message: "API rate limit exceeded for 203.0.113.9",
    });

    await expect(failing.releases.list()).rejects.toThrow(
      "Meru's releases were not listed"
    );
    expect(failing.logs).toStrictEqual([
      "Meru's releases were not listed: the answer was no list",
    ]);
  });
});
