import { describe, expect, it } from "vitest";

import { isReleaseLink, shownReleases } from "./releases.ts";
import type { Release } from "./releases.ts";

const release = (tag: string, prerelease = false): Release => ({
  tag,
  publishedAt: 1,
  notes: `Notes of ${tag}`,
  prerelease,
});

const RELEASES = [
  release("v4.1.0-beta.2", true),
  release("v4.1.0-beta.1", true),
  release("v4.0.1"),
  release("v4.0.0"),
];

const tagsOf = (shown: ReturnType<typeof shownReleases>) =>
  shown.map(({ tag, current }) => (current ? `${tag} (current)` : tag));

describe(shownReleases, () => {
  it("hides betas on the Stable channel, newest first as GitHub lists them", () => {
    expect(tagsOf(shownReleases(RELEASES, "stable", "4.0.1"))).toStrictEqual([
      "v4.0.1 (current)",
      "v4.0.0",
    ]);
  });

  it("keeps the beta that is running on the Stable channel", () => {
    expect(
      tagsOf(shownReleases(RELEASES, "stable", "4.1.0-beta.1"))
    ).toStrictEqual(["v4.1.0-beta.1 (current)", "v4.0.1", "v4.0.0"]);
  });

  it("lists every release on the Beta channel", () => {
    expect(tagsOf(shownReleases(RELEASES, "beta", "4.0.0"))).toStrictEqual([
      "v4.1.0-beta.2",
      "v4.1.0-beta.1",
      "v4.0.1",
      "v4.0.0 (current)",
    ]);
  });

  it("marks nothing current for a build no release has, such as a dev build", () => {
    expect(
      shownReleases(RELEASES, "stable", "4.0.0-dev.0").some(
        ({ current }) => current
      )
    ).toBeFalsy();
  });
});

describe(isReleaseLink, () => {
  it.each(["https://github.com/zoidsh/meru/issues/1", "http://example.com/"])(
    "lets %s leave for the browser",
    (href) => {
      expect(isReleaseLink(href)).toBeTruthy();
    }
  );

  it.each([
    ["javascript", "alert(1)"].join(":"),
    "file:///etc/passwd",
    "mailto:someone@example.com",
    "https://user:secret@example.com/",
    "#heading",
    "not a link",
    undefined,
  ])("keeps %s from leaving", (href) => {
    expect(isReleaseLink(href)).toBeFalsy();
  });
});
