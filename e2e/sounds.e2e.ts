import type { ElectronApplication } from "@playwright/test";

import {
  expect,
  findPage,
  readUnreadTotal,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { ANY_SESSION, listing } from "./lib/stand-in.ts";

// The suite's build captures every sound on `meruTestSounds` and never sends
// one to the shell, so nothing here is ever heard.

interface Captured {
  title: string;
  silent?: boolean;
}

/** Each notification captured, as its title and whether it was silent. */
const notifications = (app: ElectronApplication) =>
  app.evaluate(() =>
    (Reflect.get(globalThis, "meruTestNotifications") as Captured[])
      .map(({ title, silent }) => ({ title, silent }))
      .toSorted((a, b) => a.title.localeCompare(b.title))
  );

const sounds = (app: ElectronApplication) =>
  app.evaluate(() => [
    ...(Reflect.get(globalThis, "meruTestSounds") as unknown[]),
  ]);

const HOME = {
  profiles: [{ id: "p0", name: "Home" }],
  selectedProfileId: "p0",
};

/** Launches on one unread message, then brings `ids` as the inbox. */
const arrive = async (
  launchApp: () => Promise<ElectronApplication>,
  standIn: StandIn,
  ids: string[]
) => {
  standIn.setFeed(ANY_SESSION, listing("1"));

  const app = await launchApp();
  const gmail = await findPage(app, standIn.url);

  await expect.poll(() => readUnreadTotal(app)).toBe(1);

  standIn.setFeed(ANY_SESSION, listing(...ids));
  // What Gmail's tab does as mail comes, which pokes the poll.
  await gmail.evaluate((count) => {
    document.title = `Inbox (${count})`;
  }, ids.length);

  await expect.poll(() => readUnreadTotal(app)).toBe(ids.length);

  return app;
};

test("new mail asks for one sound, the chosen one at the chosen volume, and each notification is silent", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, HOME);
  await writeSettings(userDataDir, {
    notificationSound: "chime",
    notificationSoundVolume: 0.4,
  });

  const app = await arrive(launchApp, standIn, ["3", "2", "1"]);

  await expect
    .poll(() => notifications(app))
    .toStrictEqual([
      { title: "Sender 2", silent: true },
      { title: "Sender 3", silent: true },
    ]);
  expect(await sounds(app)).toStrictEqual([{ sound: "chime", volume: 0.4 }]);
});

test("mail Do Not Disturb holds asks for no sound", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, { ...HOME, doNotDisturb: { until: null } });
  await writeSettings(userDataDir, {});

  const app = await arrive(launchApp, standIn, ["2", "1"]);

  expect(await notifications(app)).toStrictEqual([]);
  expect(await sounds(app)).toStrictEqual([]);
});

// The suite's build plays only through the addon's `none` sink, which opens
// no output device.
test("the packed app's audio addon plays a sound to its end", async ({
  app,
}) => {
  await expect
    .poll(() =>
      app.evaluate(() => typeof Reflect.get(globalThis, "meruTestPlaySound"))
    )
    .toBe("function");

  const played = await app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestPlaySound") as (
        name: string,
        volume: number
      ) => Promise<string>
    )("nod.wav", 0.5)
  );

  expect(played).toBe("played");
});

test("with the system's sound, Meru plays none and the notification is not silent", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, HOME);
  await writeSettings(userDataDir, { notificationSound: "system" });

  const app = await arrive(launchApp, standIn, ["2", "1"]);

  await expect
    .poll(() => notifications(app))
    .toStrictEqual([{ title: "Sender 2", silent: false }]);
  expect(await sounds(app)).toStrictEqual([]);
});
