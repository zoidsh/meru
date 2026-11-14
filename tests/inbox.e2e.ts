import type { ElectronApplication, Page } from "@playwright/test";

import { ONE_UNREAD, TWO_UNREAD } from "../app/core/fixtures/gmail-feeds.ts";
import { expect, inspect, profilesOf, test } from "./app.ts";

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

// Waking the machine reads every feed at once, rather than waiting out the 30 seconds between reads.
const wake = async (app: ElectronApplication) => {
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });
};

test("shows the feed's unread count, notifies about mail that arrives and marks a signed-out session", async ({
  feed,
  launch,
  stub,
}) => {
  feed.answer({ kind: "feed", text: issuedNow(ONE_UNREAD) });
  const { app, chrome } = await launch({
    env: { MERU_ENTITLEMENT_URL: stub.url, MERU_FEED_URL: feed.url },
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

  feed.answer({ kind: "signIn" });
  await wake(app);
  await expect
    .poll(async () => await statusOf(chrome))
    .toStrictEqual({ kind: "needsSignIn" });
});
