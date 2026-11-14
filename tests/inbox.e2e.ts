import type { ElectronApplication, Page } from "@playwright/test";

import { ONE_UNREAD, TWO_UNREAD } from "../app/core/fixtures/gmail-feeds.ts";
import { E2E_CLICK_NOTIFICATION } from "../app/main/shell/e2e.ts";
import { expect, inspect, panesOf, profilesOf, test } from "./app.ts";
import { SIGN_IN_PATH } from "./feed-stub.ts";

// The inbox calls mail new only if it was issued shortly before the last read, so the fixture's entries are dated now.
const issuedNow = (text: string) =>
  text.replaceAll(
    /<issued>[^<]*<\/issued>/gu,
    `<issued>${new Date().toISOString()}</issued>`
  );

const badgeOf = async (app: ElectronApplication) => {
  const { badge } = await inspect(app);
  return badge;
};

const notifiedOf = async (app: ElectronApplication) => {
  const { notifications } = await inspect(app);
  return notifications.map((shown) => shown.title);
};

const statusOf = async (chrome: Page) => {
  const { profiles } = await profilesOf(chrome);
  return profiles[0]?.status;
};

const clickNotification = async (app: ElectronApplication, index: number) => {
  await app.evaluate(
    (_electron, [name, at]) => {
      const click: unknown = Reflect.get(globalThis, name);
      if (typeof click !== "function") {
        throw new TypeError(`Main exposes nothing under ${name}`);
      }
      Reflect.apply(click, undefined, [at]);
    },
    [E2E_CLICK_NOTIFICATION, index] as const
  );
};

const paneUrlsOf = async (app: ElectronApplication) => {
  const panes = await panesOf(app);
  return await app.evaluate(
    ({ webContents }, ids) =>
      ids.map((id) => webContents.fromId(id)?.getURL() ?? ""),
    panes.map((pane) => pane.contentsId)
  );
};

// Waking the machine reads every feed at once, rather than waiting out the 30 seconds between reads.
const wake = async (app: ElectronApplication) => {
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });
};

test("shows the feed's unread count, notifies about mail that arrives, opens a message from its notification and marks a signed-out session without following its redirect", async ({
  feed,
  launch,
  stub,
}) => {
  feed.answer({ kind: "feed", text: issuedNow(ONE_UNREAD) });
  const { app, chrome } = await launch({
    env: { MERU_ENTITLEMENT_URL: stub.url, MERU_GMAIL_URL: feed.url },
  });
  await expect
    .poll(async () => await statusOf(chrome))
    .toStrictEqual({ kind: "ok", unreadCount: 1 });
  await expect.poll(async () => await badgeOf(app)).toBe(1);

  feed.answer({ kind: "feed", text: issuedNow(TWO_UNREAD) });
  await wake(app);
  await expect
    .poll(async () => await notifiedOf(app))
    .toStrictEqual(["12345", "Tom O'Brien"]);
  await expect.poll(async () => await badgeOf(app)).toBe(2);

  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.hide();
    }
  });
  await clickNotification(app, 1);
  await expect
    .poll(async () => await paneUrlsOf(app))
    .toStrictEqual([`${feed.url}/#inbox/18c1a2b3c4d5e6f7`]);
  await expect
    .poll(
      async () =>
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((window) => window.isVisible())
        )
    )
    .toBe(true);

  feed.answer({ kind: "signIn" });
  await wake(app);
  await expect
    .poll(async () => await statusOf(chrome))
    .toStrictEqual({ kind: "needsSignIn" });
  expect(feed.requests).not.toContain(SIGN_IN_PATH);
});
