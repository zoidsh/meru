import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { expect, findPage, readViews, test } from "./lib/app.ts";
import type { StandIn, StandInMail } from "./lib/stand-in.ts";
import {
  ACCOUNT_COOKIE,
  CALENDAR_TITLE,
  STAND_IN_TITLE,
  messageLink,
} from "./lib/stand-in.ts";

/** A session with no account cookie, which every profile here is. */
const ANY_SESSION = "";

const message = (id: string): StandInMail => ({
  id,
  subject: `Subject ${id}`,
  summary: `Summary ${id} <b>&amp;</b>`,
  senderName: `Sender ${id}`,
  senderAddress: `sender${id}@example.com`,
});

/** The feed lists these messages, newest first, as all that is unread. */
const listing = (...ids: string[]) => ({
  unreadCount: ids.length,
  mail: ids.map((id) => message(id)),
});

interface Captured {
  title: string;
  subtitle?: string;
  body: string;
  shown: boolean;
  actions?: string[];
}

type Placed = Pick<Captured, "subtitle" | "body">;

/** One order, whichever order they came in: by subtitle, then body. */
const inOrder = (a: Placed, b: Placed) =>
  (a.subtitle ?? "").localeCompare(b.subtitle ?? "") ||
  a.body.localeCompare(b.body);

/** What the suite's build captured in place of showing, in order. */
const captured = async (app: ElectronApplication) => {
  const notifications = await app.evaluate(() =>
    (Reflect.get(globalThis, "meruTestNotifications") as Captured[]).map(
      ({ title, subtitle, body, shown }) => ({
        title,
        body,
        shown,
        ...(subtitle === undefined ? {} : { subtitle }),
      })
    )
  );

  return notifications.toSorted(inOrder);
};

/** Clicks the notification titled `text`, or naming it as its profile. */
const click = (app: ElectronApplication, text: string) =>
  app.evaluate((_electron, wanted) => {
    const notifications = Reflect.get(
      globalThis,
      "meruTestNotifications"
    ) as (Captured & { click: () => void })[];

    notifications
      .find(
        ({ title, subtitle, body }) =>
          title === wanted ||
          subtitle === wanted ||
          body.startsWith(`${wanted}\n`)
      )
      ?.click();
  }, text);

/** The URL and session of each view that shows. */
const shownViews = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views
    .filter((view) => view.visible)
    .map(({ url, partition }) => ({ url, partition }));
};

const BODY = "Subject 2\nSummary 2 <b>&amp;</b>";

/** Where the profile's name is: the subtitle on macOS, else atop the body. */
const naming = (name: string) =>
  process.platform === "darwin"
    ? { subtitle: name, body: BODY }
    : { body: `${name}\n${BODY}` };

/** What Gmail's tab would do as mail comes: change its title, a poke. */
const retitle = (page: Page, title: string) =>
  page.evaluate((next) => {
    document.title = next;
  }, title);

const profileTab = (shell: Page, name: string) =>
  shell
    .getByRole("tablist", { name: "Profiles" })
    .getByRole("tab", { name: new RegExp(`^${name}`, "u") });

const writeState = (userDataDir: string, profiles: unknown[]) =>
  writeFile(
    path.join(userDataDir, "state.json"),
    JSON.stringify({ version: 1, profiles, selectedProfileId: "p0" })
  );

const launchOn = async (
  launchApp: () => Promise<ElectronApplication>,
  standIn: StandIn
) => {
  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  return { app, shell, gmail: await findPage(app, standIn.url) };
};

test("notifies mail that arrives after the first poll, in each profile, and a click opens it in its profile's Gmail", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  // Work was never selected, so its Gmail tab has no view until the click.
  await writeState(userDataDir, [
    { id: "p0", name: "Home" },
    {
      id: "p1",
      name: "Work",
      tabs: [
        {
          id: "c",
          app: "calendar",
          url: standIn.calendarUrl,
          title: CALENDAR_TITLE,
        },
      ],
      selectedTabId: "c",
    },
  ]);
  standIn.setFeed(ANY_SESSION, listing("1"));

  const { app, shell } = await launchOn(launchApp, standIn);

  await expect(profileTab(shell, "Home")).toHaveAccessibleName(
    "Home, 1 unread message"
  );
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 1 unread message"
  );
  expect(await captured(app)).toStrictEqual([]);

  standIn.setFeed(ANY_SESSION, listing("2", "1"));
  // Waking polls every profile, Work's with no page among them.
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });

  await expect
    .poll(() => captured(app))
    .toStrictEqual(
      [
        { title: "Sender 2", shown: true, ...naming("Home") },
        { title: "Sender 2", shown: true, ...naming("Work") },
      ].toSorted(inOrder)
    );

  await click(app, "Work");

  await expect(profileTab(shell, "Work")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { selected: true })
  ).toHaveAccessibleName(STAND_IN_TITLE);
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([
      { url: messageLink(standIn.url, "2"), partition: "persist:p1" },
    ]);
  await expect
    .poll(() => captured(app))
    .toStrictEqual(
      [
        { title: "Sender 2", shown: true, ...naming("Home") },
        { title: "Sender 2", shown: false, ...naming("Work") },
      ].toSorted(inOrder)
    );
});

test("shows no notification while notifications are off", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, [{ id: "p0", name: "Home" }]);
  await writeFile(
    path.join(userDataDir, "settings.json"),
    JSON.stringify({ version: 1, notifications: false })
  );
  standIn.setFeed(ANY_SESSION, listing("1"));

  const { app, shell, gmail } = await launchOn(launchApp, standIn);
  const home = profileTab(shell, "Home");

  await expect(home).toHaveAccessibleName("Home, 1 unread message");

  standIn.setFeed(ANY_SESSION, listing("2", "1"));
  await retitle(gmail, "Inbox (2)");

  await expect(home).toHaveAccessibleName("Home, 2 unread messages");
  expect(await captured(app)).toStrictEqual([]);
});

test("tells four new messages as one, which opens the inbox", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, [{ id: "p0", name: "Home" }]);
  standIn.setFeed(ANY_SESSION, listing("1"));

  const { app, shell, gmail } = await launchOn(launchApp, standIn);

  await expect(profileTab(shell, "Home")).toHaveAccessibleName(
    "Home, 1 unread message"
  );

  standIn.setFeed(ANY_SESSION, listing("5", "4", "3", "2", "1"));
  await retitle(gmail, "Inbox (5)");

  await expect
    .poll(() => captured(app))
    .toStrictEqual([{ title: "4 new messages", body: "", shown: true }]);

  // Away from the inbox first, so the click is seen to bring it back.
  await gmail.evaluate(() => {
    location.hash = "elsewhere";
  });
  await click(app, "4 new messages");

  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p0" }]);
});

/** Signs the profile's session in to the stand-in as an account of its own. */
const signIn = (
  app: ElectronApplication,
  standIn: StandIn,
  profileId: string
) =>
  app.evaluate(
    async ({ session }, { partition, url, name }) => {
      await session.fromPartition(partition).cookies.set({
        url,
        name,
        value: partition,
      });
    },
    {
      partition: `persist:${profileId}`,
      url: standIn.url,
      name: ACCOUNT_COOKIE,
    }
  );

test("a notification's action runs on its message in its profile, with no page, and the count follows", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  // Work's Gmail tab has no view, so the action has no page to go through.
  await writeState(userDataDir, [
    { id: "p0", name: "Home" },
    {
      id: "p1",
      name: "Work",
      tabs: [
        {
          id: "c",
          app: "calendar",
          url: standIn.calendarUrl,
          title: CALENDAR_TITLE,
        },
      ],
      selectedTabId: "c",
    },
  ]);
  standIn.setFeed(ANY_SESSION, listing("1"));
  standIn.setFeed("persist:p1", listing("1"));

  const { app, shell } = await launchOn(launchApp, standIn);
  const wake = () =>
    app.evaluate(({ powerMonitor }) => {
      powerMonitor.emit("resume");
    });

  await signIn(app, standIn, "p1");
  await wake();
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 1 unread message"
  );

  standIn.setFeed("persist:p1", listing("2", "1"));
  standIn.setFeedAfterAction("persist:p1", listing("1"));
  await wake();

  await expect
    .poll(() =>
      app.evaluate(() =>
        (Reflect.get(globalThis, "meruTestNotifications") as Captured[]).map(
          ({ title, subtitle, body, actions }) => ({
            title,
            name: subtitle ?? body.split("\n", 1)[0],
            actions,
          })
        )
      )
    )
    .toStrictEqual([
      {
        title: "Sender 2",
        name: "Work",
        actions: ["Archive", "Mark as Read", "Delete", "Mark as Spam"],
      },
    ]);
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 2 unread messages"
  );

  await app.evaluate((_electron, label) => {
    const [notification] = Reflect.get(
      globalThis,
      "meruTestNotifications"
    ) as (Captured & { act: (index: number) => void })[];

    notification?.act(notification.actions?.indexOf(label) ?? -1);
  }, "Mark as Read");

  await expect
    .poll(() => standIn.actions)
    .toStrictEqual([{ account: "persist:p1", code: 3, messageId: "2" }]);
  // Past the poke's throttle, the count follows.
  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 1 unread message"
  );
  const [acted] = await captured(app);

  expect(acted?.shown).toBe(false);
  await expect(profileTab(shell, "Home")).toHaveAttribute(
    "aria-selected",
    "true"
  );
});
