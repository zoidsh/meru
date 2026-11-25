import { describe, expect, it } from "vitest";

import type { Settings } from "#core/settings.ts";
import { fakeDefaultBrowser } from "#platform/default-browser.fake.ts";
import type { LinkAnswer, LinkQuestion } from "#platform/link-prompt.ts";

import { createDefaultBrowserGuard } from "./default-browser-guard.ts";
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
  const { fake: system, defaultBrowser } = fakeDefaultBrowser();
  const clipboard = {
    writeText: (text: string) => {
      copied.push(text);

      return Promise.resolve();
    },
  };
  const opener = createLinkOpener({
    settings,
    trustedSites,
    defaultBrowser: createDefaultBrowserGuard({
      platform: "darwin",
      defaultBrowser,
      clipboard,
      log: () => false,
    }),
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
    clipboard,
    log: () => false,
  });

  return {
    opener,
    system,
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

  it("offers no trust for a link still wrapped in Google's redirect, and trusts nothing from it", async () => {
    const { opener, asked, opened, trustedSites, answer } = setup();
    const wrapped = "https://www.google.com/url?q=javascript:alert(1)";

    answer({ choice: "open", trust: true });
    await opener.open(wrapped);

    expect([
      asked.map((question) => question.trustLabel),
      opened,
      trustedSites.list(),
    ]).toStrictEqual([[undefined], [wrapped], []]);
  });

  it("opens every link without asking while asking is off", async () => {
    const { opener, asked, opened } = setup({
      version: 1,
      confirmLinks: false,
    });

    await opener.open(LINK);

    expect([asked, opened]).toStrictEqual([[], [LINK]]);
  });

  it("reads a trusted list that is not a list as none, keeps it as found, and replaces it once a site is trusted", async () => {
    const { opener, asked, saved, answer } = setup({
      version: 1,
      trustedSites: "https://example.net",
    });

    await opener.open("https://example.net/");

    expect([asked.length, saved]).toStrictEqual([1, []]);

    answer({ choice: "open", trust: true });
    await opener.open(LINK);

    expect(saved.at(-1)?.trustedSites).toStrictEqual(["https://example.org"]);
  });

  it("reads a trusted list entry by entry, and keeps its readable entries when a site is added", async () => {
    const { opener, asked, saved, trustedSites, answer } = setup({
      version: 1,
      trustedSites: ["https://example.net", 5, null],
    });

    await opener.open("https://example.net/");

    expect([asked, trustedSites.list()]).toStrictEqual([
      [],
      ["https://example.net"],
    ]);

    answer({ choice: "open", trust: true });
    await opener.open(LINK);

    expect(saved.at(-1)?.trustedSites).toStrictEqual([
      "https://example.net",
      "https://example.org",
    ]);
  });

  it("while Meru is the default browser shows the guard's alert in place of asking, and opens nothing, trusted or not", async () => {
    const { opener, system, asked, opened, copied } = setup({
      version: 1,
      trustedSites: ["https://example.net"],
    });

    system.isDefault = true;
    await opener.open(LINK);
    await opener.open("https://example.net/");

    expect([system.asked.length, asked, opened, copied]).toStrictEqual([
      2,
      [],
      [],
      [],
    ]);
  });

  it("while Meru is the default browser copies the link on the alert's Copy Link and opens the system's settings on its other button", async () => {
    const { opener, system, opened, copied } = setup();

    system.isDefault = true;
    system.answer = "copy";
    await opener.open(LINK);
    system.answer = "settings";
    await opener.open(LINK);

    expect([copied, system.settingsOpened, opened]).toStrictEqual([
      [LINK],
      1,
      [],
    ]);
  });

  it("asks again once Meru is no longer the default browser", async () => {
    const { opener, system, asked, opened } = setup();

    system.isDefault = true;
    await opener.open(LINK);
    system.isDefault = false;
    await opener.open(LINK);

    expect([system.asked.length, asked.length, opened]).toStrictEqual([
      1,
      1,
      [LINK],
    ]);
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
