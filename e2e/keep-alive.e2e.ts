import type { ElectronApplication } from "@playwright/test";

import { expect, findPage, readViews, test, writeState } from "./lib/app.ts";
import {
  ANY_SESSION,
  ROTATING_COOKIE,
  ROTATION_PATH,
  listing,
  signIn,
} from "./lib/stand-in.ts";

/** The renderer processes the app runs, the shell's and the overlay's too. */
const countRenderers = (app: ElectronApplication) =>
  app.evaluate(
    ({ app: electronApp }) =>
      electronApp.getAppMetrics().filter((metric) => metric.type === "Tab")
        .length
  );

const HOUR = 3_600_000;
const YEAR = 365 * 24 * HOUR;

test("a sleeping profile whose sign-in went stale loads the rotation page in its session, hidden, until the cookie rotates, and an awake profile with a page gets none", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      { id: "p1", name: "Work", asleep: true },
    ],
    selectedProfileId: "p0",
  });

  // Signed in before and after the account cookies below are set.
  for (const account of [ANY_SESSION, "persist:p0", "persist:p1"]) {
    standIn.setFeed(account, listing("1"));
  }

  const app = await launchApp({ MERU_TEST_KEEP_ALIVE: "1" });

  await Promise.all(["p0", "p1"].map((id) => signIn(app, standIn, id)));
  await findPage(app, standIn.url);
  await expect.poll(() => countRenderers(app)).toBe(2);

  // Work's cookie, as a page of it last rotated it an hour ago.
  await app.evaluate(
    async ({ session }, { url, path, name, expirationDate }) => {
      await session.fromPartition("persist:p1").cookies.set({
        url,
        path,
        name,
        value: "stale",
        secure: true,
        httpOnly: true,
        expirationDate,
      });
    },
    {
      url: standIn.url,
      path: ROTATION_PATH,
      name: ROTATING_COOKIE,
      expirationDate: (Date.now() + YEAR - HOUR) / 1000,
    }
  );

  const workRequests = () =>
    standIn
      .rotationCookieHeaders()
      .filter((cookie) => cookie.includes("account=persist:p1")).length;

  await expect.poll(workRequests).toBeGreaterThanOrEqual(1);
  expect(standIn.rotationCookieHeaders()[0]).toContain(
    `${ROTATING_COOKIE}=stale`
  );
  // Closed by the rotation, the shell's and Home's left: well inside the
  // shortened 5 s timeout, which would close it too, and before the next run.
  await expect.poll(() => countRenderers(app), { timeout: 1500 }).toBe(2);

  // The next once the shortened age has passed again, by which time Home's
  // cookie, set as its page loaded, is stale too.
  await expect.poll(workRequests).toBeGreaterThanOrEqual(2);
  await expect.poll(() => countRenderers(app)).toBe(2);

  const { views } = await readViews(app);

  expect(views.map(({ partition }) => partition)).toStrictEqual(["persist:p0"]);
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    )
  ).toBe(1);
  expect(
    standIn
      .rotationCookieHeaders()
      .some((cookie) => cookie.includes("account=persist:p0"))
  ).toBe(false);
});
