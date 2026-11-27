import { setImmediate as nextTurn } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { recordInto } from "#core/log.fake.ts";
import { PAGE_MENU_ITEMS } from "#core/page-menu.ts";
import type { PageClick } from "#core/page-menu.ts";
import type { Platform } from "#core/platform.ts";
import type { ContextMenuItem } from "#platform/context-menu.ts";
import type { PageMenuTarget } from "#platform/page-menu.ts";

import { createPageMenu, pageMenuLabel } from "./page-menu.ts";
import type { SenderIdentity } from "./senders.ts";

const GMAIL = 1;
const CALENDAR = 2;
const POPOUT = 3;

const IDENTITIES: Record<number, SenderIdentity> = {
  [GMAIL]: { role: "content-view", profileId: "p", tabId: "gmail" },
  [CALENDAR]: { role: "content-view", profileId: "p", tabId: "c" },
  [POPOUT]: { role: "child-window", profileId: "p", tabId: "gmail" },
  10: { role: "shell" },
  11: { role: "settings" },
  12: { role: "overlay" },
};

const click = (change: Partial<PageClick> = {}): PageClick => ({
  editable: false,
  selection: "",
  misspelledWord: "",
  suggestions: [],
  linkUrl: "",
  edit: { canCut: false, canCopy: false, canPaste: false, canSelectAll: true },
  ...change,
});

/** A page that records each menu it pops up and each thing done in it. */
const fakeTarget = (url = "https://calendar.google.com/r/week") => {
  const done: string[] = [];
  const popups: (readonly ContextMenuItem[])[] = [];
  let destroyed = false;
  const target: PageMenuTarget = {
    url: () => url,
    isDestroyed: () => destroyed,
    popup: (items) => {
      popups.push(items);
    },
    replaceMisspelling: (suggestion) => done.push(`replace ${suggestion}`),
    learnSpelling: (word) => done.push(`learn ${word}`),
    lookUp: () => done.push("lookUp"),
    edit: (command) => done.push(command),
    copyImage: () => done.push("copyImage"),
    download: (address) => done.push(`download ${address}`),
    inspectElement: () => done.push("inspect"),
  };

  return {
    target,
    done,
    popups,
    destroy: () => {
      destroyed = true;
    },
  };
};

const setup = (platform: Platform = "darwin") => {
  const logs: string[] = [];
  const copied: string[] = [];
  const opened: string[] = [];
  const saved: string[] = [];
  const identities = new Map(
    Object.entries(IDENTITIES).map(([id, identity]) => [Number(id), identity])
  );
  const menu = createPageMenu({
    platform,
    identify: (id) => identities.get(id),
    isGmailTab: (key) => key.tabId === "gmail",
    clipboard: {
      writeText: (text) => {
        copied.push(text);

        return Promise.resolve();
      },
    },
    browser: {
      open: (url) => {
        opened.push(url);

        return Promise.resolve();
      },
    },
    downloads: {
      saveAs: (url, download) => {
        saved.push(url);
        download(url);
      },
    },
    log: recordInto(logs),
  });

  return {
    menu,
    logs,
    copied,
    opened,
    saved,
    forget: (id: number) => {
      identities.delete(id);
    },
  };
};

const labelsOf = (items: readonly ContextMenuItem[] | undefined) =>
  items?.map((item) =>
    "type" in item ? "—" : `${item.label}${item.enabled ? "" : " (off)"}`
  );

/** Clicks the item with this label, as choosing it would. */
const choose = async (items: readonly ContextMenuItem[], label: string) => {
  const item = items.find(
    (candidate) => !("type" in candidate) && candidate.label === label
  );

  if (!item || "type" in item) {
    throw new Error(`No item ${label}`);
  }

  await item.click?.();
  await nextTurn();
};

describe("which pages get the menu", () => {
  it("pops one up in a tab's view and a window a page opened, the tab items only in a tab other than Gmail's", () => {
    const { menu } = setup();
    const shown = [GMAIL, CALENDAR, POPOUT].map((id) => {
      const page = fakeTarget();

      menu.open(id, click(), page.target);

      return labelsOf(page.popups[0]);
    });

    expect(shown).toStrictEqual([
      ["Inspect Element"],
      ["Copy URL", "Open in Default Browser", "—", "Inspect Element"],
      ["Inspect Element"],
    ]);
  });

  it("pops none up in the shell, Settings, the overlay or a web contents Meru does not know", () => {
    const { menu } = setup();
    const popped = [10, 11, 12, 99].map((id) => {
      const page = fakeTarget();

      menu.open(id, click(), page.target);

      return page.popups.length;
    });

    expect(popped).toStrictEqual([0, 0, 0, 0]);
  });
});

describe("choosing an item", () => {
  it("replaces the misspelt word with a suggestion, and learns the word", async () => {
    const { menu } = setup();
    const page = fakeTarget();

    menu.open(
      GMAIL,
      click({
        editable: true,
        misspelledWord: "teh",
        suggestions: ["the", "ten"],
      }),
      page.target
    );

    const [items = []] = page.popups;

    await choose(items, "ten");
    await choose(items, "Learn Spelling");

    expect([labelsOf(items)?.slice(0, 4), page.done]).toStrictEqual([
      ["the", "ten", "—", "Learn Spelling"],
      ["replace ten", "learn teh"],
    ]);
  });

  it("looks the selection up under its quote on macOS, searches Google for it and copies it", async () => {
    const { menu, opened } = setup();
    const page = fakeTarget();

    menu.open(
      GMAIL,
      click({
        selection: "Quarterly planning review for the whole team",
        edit: { ...click().edit, canCopy: true },
      }),
      page.target
    );

    const [items = []] = page.popups;

    await choose(items, "Look Up “Quarterly planning review…”");
    await choose(items, "Search with Google");
    await choose(items, "Copy");

    expect([page.done, opened]).toStrictEqual([
      ["lookUp", "copy"],
      [
        "https://www.google.com/search?q=Quarterly+planning+review+for+the+whole+team",
      ],
    ]);
  });

  it("runs each edit command a field offers, Select All on Linux", async () => {
    const { menu } = setup("linux");
    const page = fakeTarget();

    menu.open(
      GMAIL,
      click({
        editable: true,
        selection: "x",
        edit: {
          canCut: true,
          canCopy: true,
          canPaste: true,
          canSelectAll: true,
        },
      }),
      page.target
    );

    const [items = []] = page.popups;

    await Promise.all(
      ["Cut", "Copy", "Paste", "Paste and Match Style", "Select All"].map(
        (label) => choose(items, label)
      )
    );

    expect(page.done).toStrictEqual([
      "cut",
      "copy",
      "paste",
      "pasteAndMatchStyle",
      "selectAll",
    ]);
  });

  it("saves an image through a download that asks where, copies it and its address, and copies an email link's address", async () => {
    const { menu, copied, saved } = setup();
    const page = fakeTarget();
    const image = "https://lh3.googleusercontent.com/photo.png";

    menu.open(
      GMAIL,
      click({ image: { url: image }, linkUrl: "mailto:ada@example.com?cc=b" }),
      page.target
    );

    const [items = []] = page.popups;

    await choose(items, "Save Image As…");
    await choose(items, "Copy Image");
    await choose(items, "Copy Image Address");
    await choose(items, "Copy Email Address");

    expect([saved, page.done, copied]).toStrictEqual([
      [image],
      [`download ${image}`, "copyImage"],
      [image, "ada@example.com"],
    ]);
  });

  it("saves no image Chromium gives no address, logging why and nothing of the page", async () => {
    const { menu, saved, logs } = setup();
    const page = fakeTarget();

    menu.open(GMAIL, click({ image: { url: "" } }), page.target);
    await choose(page.popups[0] ?? [], "Save Image As…");

    expect([saved, page.done, logs]).toStrictEqual([
      [],
      [],
      ["page-image-unsaved reason=no-address"],
    ]);
  });

  it("copies a link's address, and the page's URL or opens it in the default browser from another app's tab", async () => {
    const { menu, copied, opened } = setup();
    const page = fakeTarget("https://calendar.google.com/r/day");

    menu.open(
      CALENDAR,
      click({ linkUrl: "https://example.com/a" }),
      page.target
    );

    const [items = []] = page.popups;

    await choose(items, "Copy Link Address");
    await choose(items, "Copy URL");
    await choose(items, "Open in Default Browser");
    await choose(items, "Inspect Element");

    expect([copied, opened, page.done]).toStrictEqual([
      ["https://example.com/a", "https://calendar.google.com/r/day"],
      ["https://calendar.google.com/r/day"],
      ["inspect"],
    ]);
  });

  it("refuses an item the menu no longer offers enabled, as once its page is gone or no longer a tab's, logging its id alone", async () => {
    const { menu, copied, logs, forget } = setup();
    const gone = fakeTarget();
    const untabbed = fakeTarget();

    menu.open(GMAIL, click({ linkUrl: "https://example.com/a" }), gone.target);
    menu.open(CALENDAR, click(), untabbed.target);
    gone.destroy();
    forget(CALENDAR);
    await choose(gone.popups[0] ?? [], "Copy Link Address");
    await choose(untabbed.popups[0] ?? [], "Copy URL");

    expect([copied, logs]).toStrictEqual([
      [],
      [
        "page-menu-refused item=copyLinkAddress",
        "page-menu-refused item=copyUrl",
      ],
    ]);
  });

  it("logs an item that failed by its id and the error, never the page", async () => {
    const { menu, logs } = setup();
    const page = fakeTarget();

    page.target.inspectElement = () => {
      throw new Error("Inspector unavailable");
    };
    menu.open(GMAIL, click(), page.target);
    await choose(page.popups[0] ?? [], "Inspect Element");

    expect(logs).toStrictEqual([
      'page-menu-failed item=inspectElement error="Inspector unavailable"',
    ]);
  });
});

describe("the labels", () => {
  it("name every item", () => {
    const label = pageMenuLabel(click({ selection: "standup" }));

    expect(
      PAGE_MENU_ITEMS.filter((id) => label(id).trim() === "")
    ).toStrictEqual([]);
  });
});
