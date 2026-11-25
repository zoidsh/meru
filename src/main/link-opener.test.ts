import { describe, expect, it } from "vitest";

import type { Settings } from "#core/settings.ts";
import type { LinkAnswer, LinkQuestion } from "#platform/link-prompt.ts";

import { createLinkOpener } from "./link-opener.ts";
import { createSettingsStore } from "./settings.ts";
import { createTrustedSites } from "./trusted-sites.ts";

const LINK = "https://example.org/news?id=1";

const setup = (initial?: Settings) => {
  const asked: LinkQuestion[] = [];
  const opened: string[] = [];
  const copied: string[] = [];
  const saved: Settings[] = [];
  let answer: LinkAnswer = { choice: "open", trust: false };
  const settings = createSettingsStore({
    initial: initial ?? { version: 1 },
    save: (written) => {
      saved.push(written);

      return Promise.resolve();
    },
    platform: "darwin",
    log: () => false,
  });
  const trustedSites = createTrustedSites(settings);
  const opener = createLinkOpener({
    settings,
    trustedSites,
    prompt: {
      ask: (question) => {
        asked.push(question);

        return Promise.resolve(answer);
      },
    },
    systemBrowser: {
      open: (url) => {
        opened.push(url);

        return Promise.resolve();
      },
    },
    clipboard: {
      writeText: (text) => {
        copied.push(text);

        return Promise.resolve();
      },
    },
    log: () => false,
  });

  return {
    opener,
    trustedSites,
    asked,
    opened,
    copied,
    saved,
    answer: (next: LinkAnswer) => {
      answer = next;
    },
  };
};

describe(createLinkOpener, () => {
  it("asks by default, showing the link, and opens it in the browser on Open Link", async () => {
    const { opener, asked, opened } = setup();

    await opener.open(LINK);

    expect([asked.map((question) => question.detail), opened]).toStrictEqual([
      [LINK],
      [LINK],
    ]);
    expect(asked[0]?.trustLabel).toBe(
      "Always open links to example.org without asking"
    );
  });

  it("copies the link and opens nothing on Copy Link", async () => {
    const { opener, opened, copied, answer } = setup();

    answer({ choice: "copy", trust: true });
    await opener.open(LINK);

    expect([opened, copied]).toStrictEqual([[], [LINK]]);
  });

  it("opens nothing on Cancel, trusting nothing even with the box ticked", async () => {
    const { opener, opened, trustedSites, answer } = setup();

    answer({ choice: "cancel", trust: true });
    await opener.open(LINK);

    expect([opened, trustedSites.list()]).toStrictEqual([[], []]);
  });

  it("trusts the site on Open Link with the box ticked, so its next link opens without asking", async () => {
    const { opener, asked, opened, trustedSites, saved, answer } = setup();

    answer({ choice: "open", trust: true });
    await opener.open(LINK);
    await opener.open("https://example.org/other");

    expect([asked.length, opened, trustedSites.list()]).toStrictEqual([
      1,
      [LINK, "https://example.org/other"],
      ["https://example.org"],
    ]);
    expect(saved.at(-1)?.trustedSites).toStrictEqual(["https://example.org"]);
  });

  it("opens a link to a site trusted in settings.json without asking, and still asks for another", async () => {
    const { opener, asked, opened } = setup({
      version: 1,
      trustedSites: ["https://example.org"],
    });

    await opener.open(LINK);
    await opener.open("https://example.net/");

    expect([asked.map((question) => question.detail), opened]).toStrictEqual([
      ["https://example.net/"],
      [LINK, "https://example.net/"],
    ]);
  });

  it("opens every link without asking while asking is off", async () => {
    const { opener, asked, opened } = setup({
      version: 1,
      confirmLinks: false,
    });

    await opener.open(LINK);

    expect([asked, opened]).toStrictEqual([[], [LINK]]);
  });

  it("reads a trusted list it cannot parse as none, and writes it back as found until one is added", async () => {
    const { opener, asked, saved, trustedSites, answer } = setup({
      version: 1,
      trustedSites: "https://example.org",
    });

    await opener.open(LINK);

    expect([asked.length, saved]).toStrictEqual([1, []]);

    answer({ choice: "open", trust: true });
    await opener.open(LINK);

    expect(trustedSites.list()).toStrictEqual(["https://example.org"]);
  });
});

describe(createTrustedSites, () => {
  it("adds each site once and removes it, as the Settings page will", async () => {
    const { trustedSites } = setup();

    await trustedSites.add("https://a.example");
    await trustedSites.add("https://b.example");
    await trustedSites.add("https://a.example");
    await trustedSites.remove("https://a.example");

    expect(trustedSites.list()).toStrictEqual(["https://b.example"]);
  });
});
