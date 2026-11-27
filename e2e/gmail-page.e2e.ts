import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import type { GmailHealth } from "#contract/gmail.ts";
import type { GmailFeature } from "#core/gmail-hooks.ts";

import { expect, findPage, test, writeSettings } from "./lib/app.ts";
import {
  GMAIL_PARTS,
  POPOUT_PATH,
  POPOUT_TITLE,
  POPUP_TITLE,
  SIGN_IN_TITLE,
  THREAD_PARTS,
  openThread,
  showSentNotice,
  threadMessage,
} from "./lib/stand-in.ts";

interface Captured {
  health: (GmailHealth & { profileId: string; tabId: string })[];
  refused: (string | undefined)[];
  sent: { webContentsId: number; notice: string }[];
}

const readCaptured = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestGmailPage") as Captured);

const readHealth = async (app: ElectronApplication) => {
  const { health } = await readCaptured(app);

  return health;
};

const lastHooks = async (app: ElectronApplication) => {
  const health = await readHealth(app);

  return health.at(-1)?.hooks;
};

const readRefused = async (app: ElectronApplication) => {
  const { refused } = await readCaptured(app);

  return refused;
};

const setSetting = (
  app: ElectronApplication,
  key: GmailFeature | "closeComposeWindowAfterSend",
  value: boolean
) =>
  app.evaluate(
    async (_electron, [settingKey, settingValue]) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set(settingKey, settingValue);
    },
    [key, value] as const
  );

/** Each of the stand-in's parts a hide takes, as the page shows it. */
const parts = (view: Page) => ({
  hidePromoBanner: view.getByText(GMAIL_PARTS.promo),
  hideUpgradeButton: view.getByRole("link", { name: GMAIL_PARTS.upgrade }),
  hideInboxFooter: view.getByRole("link", { name: GMAIL_PARTS.policy }),
});

/** What a hide may never take, whatever it matches. */
const expectUntouched = async (view: Page) => {
  await expect(
    view.getByRole("table", { name: GMAIL_PARTS.list })
  ).toBeVisible();
  await expect(
    view.getByRole("textbox", { name: GMAIL_PARTS.search })
  ).toBeVisible();
  await expect(view.getByRole("main")).toBeVisible();
};

/** Every hide on, as a person turns them on; none is on by default. */
const HIDES_ON = {
  hideInboxFooter: true,
  hidePromoBanner: true,
  hideUpgradeButton: true,
};

/** Moves within the page, as Gmail does between views. */
const moveTo = (view: Page, hash: string) =>
  view.evaluate((next) => {
    location.hash = next;
  }, hash);

test("hides each of Gmail's parts whose hide is on at launch, and reports every hook matched in the list", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, HIDES_ON);

  const app = await launchApp();
  const view = await findPage(app, standIn.url);

  await Promise.all(
    Object.values(parts(view)).map((part) => expect(part).toBeHidden())
  );

  await expectUntouched(view);
  await expect
    .poll(() => readHealth(app))
    .toMatchObject([
      {
        views: ["list"],
        hooks: {
          footer: "matched",
          promo: "matched",
          upgrade: "matched",
        },
      },
    ]);
});

test("shows each part on a fresh profile, since Meru hides nothing of Gmail until asked", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await Promise.all(
    Object.values(parts(view)).map((part) => expect(part).toBeVisible())
  );

  await expectUntouched(view);
});

test("switches each hide off and on again while the page stays loaded, touching the others not", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, HIDES_ON);

  const app = await launchApp();
  const view = await findPage(app, standIn.url);
  const all = parts(view);

  await expect(all.hidePromoBanner).toBeHidden();
  await view.evaluate(() => {
    Reflect.set(window, "keptAcrossSwitches", true);
  });

  for (const [feature, part] of Object.entries(all) as [
    keyof typeof all,
    (typeof all)[keyof typeof all],
  ][]) {
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await setSetting(app, feature, false);
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await expect(part).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await Promise.all(
      Object.entries(all)
        .filter(([other]) => other !== feature)
        .map(([, other]) => expect(other).toBeHidden())
    );
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await setSetting(app, feature, true);
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await expect(part).toBeHidden();
  }

  await expectUntouched(view);
  // Applied live, never by a reload.
  expect(
    await view.evaluate(() => Reflect.get(window, "keptAcrossSwitches"))
  ).toBe(true);
});

test("reports a hook broken when the markup it anchors on goes, and absent when its content does", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, HIDES_ON);

  const app = await launchApp();
  const view = await findPage(app, standIn.url);

  await expect.poll(() => readHealth(app)).toHaveLength(1);

  // As Gmail might rename its markup: the footer's container loses its role
  // while its policy link stays.
  await view.evaluate(() => {
    document.querySelector('[role="contentinfo"]')?.removeAttribute("role");
    document
      .querySelector("[data-rp-onramp-container] > p")
      ?.parentElement?.remove();
  });
  await moveTo(view, "#inbox/renamed");

  // The check waits for the view to settle, and looks again before calling a
  // hook broken.
  await expect
    .poll(() => lastHooks(app), {
      timeout: 15_000,
    })
    .toStrictEqual({
      footer: "broken",
      promo: "absent",
      upgrade: "matched",
      conversation: "absent",
      attachments: "absent",
      trimmed: "absent",
      trimmedToggle: "absent",
      refresh: "matched",
      darkPane: "absent",
      darkPaneText: "absent",
      darkCompose: "absent",
      darkComposeText: "absent",
      darkComposePaint: "absent",
      editorCard: "absent",
      bodyCard: "absent",
      darkMenu: "absent",
      darkMenuText: "absent",
      darkMenuPaint: "absent",
      darkDialog: "absent",
      darkDialogText: "absent",
      sentNotice: "absent",
      sentUndo: "absent",
    });
  // A broken hook does nothing: the policy link it no longer reaches shows.
  await expect(parts(view).hideInboxFooter).toBeVisible();
  await expectUntouched(view);
});

test("drops the handshake of a document off Gmail's origin in Gmail's view, which then hides nothing", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, HIDES_ON);

  const app = await launchApp();
  const view = await findPage(app, standIn.url);

  await expect(parts(view).hideUpgradeButton).toBeHidden();
  await view.evaluate((url) => {
    location.href = url;
  }, standIn.signInUrl);
  await expect(
    view.getByRole("heading", { name: SIGN_IN_TITLE })
  ).toBeVisible();
  await expect(parts(view).hideUpgradeButton).toBeVisible();

  await setSetting(app, "hideUpgradeButton", false);
  await setSetting(app, "hideUpgradeButton", true);
  await expect(parts(view).hideUpgradeButton).toBeVisible();
  // A Gmail tab's hop through sign-in is ordinary, so it is dropped silently.
  expect(await readRefused(app)).toStrictEqual([]);
});

/** Each webContents' URL and the file name of its preload, if any. */
const readPreloads = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((each) => {
      // getLastWebPreferences() leaves the preload out; this is what
      // Electron's own sandbox loader reads it from.
      const script = (
        Reflect.get(each, "_getPreloadScript") as () => {
          filePath: string;
        } | null
      ).call(each);

      return {
        url: each.getURL(),
        preload: script && script.filePath.split(/[\\/]/u).at(-1),
      };
    })
  );

test("gives Gmail's preload to Gmail's view and to Gmail's pop-out, not to another app's view nor to a window on another site", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const popoutUrl = `${standIn.url}${POPOUT_PATH.slice(1)}`;

  await view.getByRole("link", { name: "Open a pop-up" }).click();

  const popup = await findPage(app, standIn.popupUrl);

  await expect(popup.getByRole("heading", { name: POPUP_TITLE })).toBeVisible();
  await view.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, popoutUrl);

  await expect(
    popout.getByRole("heading", { name: POPOUT_TITLE })
  ).toBeVisible();
  await view.getByRole("link", { name: "Open Calendar" }).click();
  await findPage(app, standIn.calendarUrl);

  const preloads = await readPreloads(app);
  const preloadOf = (url: string) =>
    preloads
      .filter((each) => each.url.startsWith(url))
      .map((each) => each.preload);

  expect(preloadOf(popoutUrl)).toStrictEqual(["preload-gmail.cjs"]);
  expect(preloadOf(standIn.calendarUrl)).toStrictEqual([null]);
  expect(preloadOf(standIn.popupUrl)).toStrictEqual([null]);
  expect(
    preloads.filter((each) => each.preload === "preload-gmail.cjs")
  ).toHaveLength(2);
});

const readSent = async (app: ElectronApplication) => {
  const { sent } = await readCaptured(app);

  return sent.map(({ notice }) => notice);
};

test("Gmail's compose pop-out tells main of its sent notice only while Close compose window after sending is on, and closes once the notice has gone", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await view.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, `${standIn.url}${POPOUT_PATH.slice(1)}`);

  await expect(
    popout.getByRole("heading", { name: POPOUT_TITLE })
  ).toBeVisible();
  await showSentNotice(popout, true);
  await showSentNotice(popout, false);
  await delay(500);

  expect(await readSent(app)).toStrictEqual([]);
  expect(await readRefused(app)).toStrictEqual([]);
  // The pop-out gets none of a tab's switches, so it never reports health.
  const health = await readHealth(app);

  expect(health.every(({ tabId }) => tabId === "gmail")).toBeTruthy();

  // Turned on and off again before any send, the pop-out stops telling.
  await setSetting(app, "closeComposeWindowAfterSend", true);
  await setSetting(app, "closeComposeWindowAfterSend", false);
  await showSentNotice(popout, true);
  await delay(500);

  expect(await readSent(app)).toStrictEqual([]);

  // On, it tells of the notice it shows, and closes once it has gone; the
  // tab's page is never told to watch, so its own tells nothing.
  await setSetting(app, "closeComposeWindowAfterSend", true);
  await expect.poll(() => readSent(app)).toStrictEqual(["shown"]);
  await showSentNotice(view, true);
  await showSentNotice(popout, false);
  await expect.poll(() => readSent(app)).toStrictEqual(["shown", "gone"]);
  await expect.poll(() => popout.isClosed()).toBeTruthy();
  await delay(500);

  expect(await readSent(app)).toHaveLength(2);
});

test("a Gmail window opened for a conversation is no compose window: a reply sent there tells nothing and the window stays", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await setSetting(app, "closeComposeWindowAfterSend", true);
  await view
    .getByRole("button", { name: "Open conversation in new window" })
    .click();

  const conversation = await findPage(
    app,
    `${standIn.url}${POPOUT_PATH.slice(1)}?ver=1&search=inbox`
  );

  await expect(
    conversation.getByRole("heading", { name: POPOUT_TITLE })
  ).toBeVisible();
  await showSentNotice(conversation, true);
  await delay(500);
  await showSentNotice(conversation, false);
  await delay(1000);

  expect(await readSent(app)).toStrictEqual([]);
  expect(conversation.isClosed()).toBeFalsy();
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((window) => window.webContents.getURL().includes("popout"))
        .map((window) => window.isVisible())
    )
  ).toStrictEqual([true]);
});

const THREAD_FEATURES = [
  "reverseConversation",
  "moveAttachmentsToTop",
  "showTrimmedContent",
] as const satisfies readonly GmailFeature[];

type ThreadSwitches = Record<(typeof THREAD_FEATURES)[number], boolean>;

const ALL_OFF: ThreadSwitches = {
  reverseConversation: false,
  moveAttachmentsToTop: false,
  showTrimmedContent: false,
};

const ALL_ON: ThreadSwitches = {
  reverseConversation: true,
  moveAttachmentsToTop: true,
  showTrimmedContent: true,
};

const top = async (view: Page, text: string) => {
  const box = await view.getByText(text, { exact: true }).boundingBox();

  return box?.y ?? Number.NaN;
};

/** The thread's messages by name, top of the screen first. */
const messageOrder = async (view: Page) => {
  const items = await view.getByRole("listitem").all();
  const placed = await Promise.all(
    items.map(async (item) => {
      const box = await item.boundingBox();

      return {
        name: (await item.getAttribute("aria-label")) ?? "",
        y: box?.y ?? Number.NaN,
      };
    })
  );

  return placed.toSorted((a, b) => a.y - b.y).map((each) => each.name);
};

const messages = (...numbers: number[]) =>
  numbers.map((n) => THREAD_PARTS.message(n));

/** Whether message `n`'s attachment shows above its text. */
const attachmentOnTop = async (view: Page, n: number) =>
  (await top(view, THREAD_PARTS.attachment(n))) <
  (await top(view, THREAD_PARTS.text(n)));

/** The style of each message's separator, top of the screen first. */
const separatorsOnScreen = (view: Page) =>
  view.evaluate(() =>
    [...document.querySelectorAll('[role="list"] > [role="listitem"]')]
      .toSorted(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
      )
      .map((item) => {
        const line = item.querySelector(":scope > .Bk > .G2");

        return line ? getComputedStyle(line).borderTopStyle : "missing";
      })
  );

/** What the thread features do to an open thread, and to its message `n`. */
const expectThread = async (
  view: Page,
  count: number,
  on: ThreadSwitches,
  n = 1
) => {
  const numbers = Array.from({ length: count }, (_, index) => index + 1);

  await expect
    .poll(() => messageOrder(view))
    .toStrictEqual(
      messages(...(on.reverseConversation ? numbers.toReversed() : numbers))
    );
  // Gmail's line between messages: none above the top one on screen, one
  // above every other, whichever way round they are.
  await expect
    .poll(() => separatorsOnScreen(view))
    .toStrictEqual(["none", ...numbers.slice(1).map(() => "solid")]);
  await expect
    .poll(() => attachmentOnTop(view, n))
    .toBe(on.moveAttachmentsToTop);

  const quoted = view.getByText(THREAD_PARTS.quoted(n));
  const toggle = view
    .getByRole("listitem", { name: THREAD_PARTS.message(n) })
    .getByRole("button", { name: THREAD_PARTS.showTrimmed });

  await (on.showTrimmedContent
    ? Promise.all([expect(quoted).toBeVisible(), expect(toggle).toBeHidden()])
    : Promise.all([expect(quoted).toBeHidden(), expect(toggle).toBeVisible()]));
};

/** The thread's markup, which no thread feature may change. */
const threadMarkupNow = (view: Page) =>
  view.evaluate(() => document.querySelector('[role="list"]')?.innerHTML);

test("switches each thread feature on and off on an open thread, changing no message and touching the others not", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await openThread(view, 3);
  await expectThread(view, 3, ALL_OFF);
  await expect
    .poll(() => lastHooks(app), { timeout: 15_000 })
    .toMatchObject({
      conversation: "matched",
      attachments: "matched",
      trimmed: "matched",
      trimmedToggle: "matched",
    });

  const before = await threadMarkupNow(view);

  await view.evaluate(() => {
    Reflect.set(window, "keptAcrossSwitches", true);
  });

  for (const feature of THREAD_FEATURES) {
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await setSetting(app, feature, true);
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await expectThread(view, 3, { ...ALL_OFF, [feature]: true });
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await setSetting(app, feature, false);
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await expectThread(view, 3, ALL_OFF);
  }

  expect(await threadMarkupNow(view)).toBe(before);
  expect(
    await view.evaluate(() => Reflect.get(window, "keptAcrossSwitches"))
  ).toBe(true);
});

test("applies the thread features on at launch, and to a message that arrives in an open thread", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, ALL_ON);

  const app = await launchApp();
  const view = await findPage(app, standIn.url);

  await openThread(view, 2);
  await expectThread(view, 2, ALL_ON);
  await view.evaluate((markup) => {
    document
      .querySelector('[role="list"]')
      ?.insertAdjacentHTML("beforeend", markup);
  }, threadMessage(3));
  await expectThread(view, 3, ALL_ON, 3);
});

test("reports a thread hook broken when Gmail's markup moves, and its feature then does nothing", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await openThread(view, 2);

  for (const feature of THREAD_FEATURES) {
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await setSetting(app, feature, true);
  }

  await expectThread(view, 2, ALL_ON);
  // As Gmail might rename its markup: the list loses its role, and the first
  // message's attachment block its classes while its download tile stays.
  await view.evaluate(() => {
    document.querySelector('[role="list"]')?.setAttribute("role", "group");
    document.querySelector(".hq.gt")?.setAttribute("class", "renamed");
    location.hash = "#inbox/t1/renamed";
  });

  await expect
    .poll(() => lastHooks(app), { timeout: 15_000 })
    .toMatchObject({
      conversation: "broken",
      attachments: "broken",
      trimmed: "matched",
    });
  expect(await messageOrder(view)).toStrictEqual(messages(1, 2));
  expect(await attachmentOnTop(view, 1)).toBe(false);
  expect(await attachmentOnTop(view, 2)).toBe(true);
});
