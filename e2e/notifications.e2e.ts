import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  findPage,
  readState,
  readUnreadTotal,
  retitle,
  shownViews,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  ANY_SESSION,
  CALENDAR_TITLE,
  DRAFT_LABEL,
  STAND_IN_TITLE,
  listing,
  message,
  messageLink,
  refreshedTimes,
  signIn,
} from "./lib/stand-in.ts";

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

/** Markup a summary carries, which the notification shows as text. */
const MARKUP_SUMMARY = "Summary 2 <b>&amp;</b>";

const BODY = `Subject 2\n${MARKUP_SUMMARY}`;

/** Where the profile's name is: the subtitle on macOS, else atop the body. */
const naming = (name: string) =>
  process.platform === "darwin"
    ? { subtitle: name, body: BODY }
    : { body: `${name}\n${BODY}` };

const profileTab = (shell: Page, name: string) =>
  shell
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}`, "u") });

const seedProfiles = (userDataDir: string, profiles: unknown[]) =>
  writeState(userDataDir, { profiles, selectedProfileId: "p0" });

const savedProfiles = async (userDataDir: string) => {
  const { profiles } = await readState<{ profiles: unknown[] }>(userDataDir);

  return profiles;
};

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
  await seedProfiles(userDataDir, [
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

  standIn.setFeed(ANY_SESSION, {
    unreadCount: 2,
    mail: [message("2", MARKUP_SUMMARY), message("1")],
  });
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
    "aria-pressed",
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
  await seedProfiles(userDataDir, [{ id: "p0", name: "Home" }]);
  await writeSettings(userDataDir, { notifications: false });
  standIn.setFeed(ANY_SESSION, listing("1"));

  const { app, gmail } = await launchOn(launchApp, standIn);
  await expect.poll(() => readUnreadTotal(app)).toBe(1);

  standIn.setFeed(ANY_SESSION, listing("2", "1"));
  await retitle(gmail, "Inbox (2)");

  await expect.poll(() => readUnreadTotal(app)).toBe(2);
  expect(await captured(app)).toStrictEqual([]);
});

test("tells four new messages as one, which opens the inbox", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, [{ id: "p0", name: "Home" }]);
  standIn.setFeed(ANY_SESSION, listing("1"));

  const { app, gmail } = await launchOn(launchApp, standIn);

  await expect.poll(() => readUnreadTotal(app)).toBe(1);

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

test("a notification's action runs on its message in its profile, with no page, and the count follows", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  // Work's Gmail tab has no view, so the action has no page to go through.
  await seedProfiles(userDataDir, [
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
    "aria-pressed",
    "true"
  );
});

const capturedTitles = async (app: ElectronApplication) => {
  const notifications = await captured(app);

  return notifications.map(({ title }) => title);
};

const doNotDisturbButton = (shell: Page) =>
  shell
    .getByRole("banner", { name: "Title bar" })
    .getByRole("button", { name: "Do Not Disturb" });

test("holds mail while Do Not Disturb is on, never shows it later, and notifies again once it is off", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, [{ id: "p0", name: "Home" }]);
  standIn.setFeed(ANY_SESSION, listing("1"));

  const { app, shell, gmail } = await launchOn(launchApp, standIn);
  const button = doNotDisturbButton(shell);

  await expect.poll(() => readUnreadTotal(app)).toBe(1);
  await expect(button).toHaveAttribute("aria-pressed", "false");

  await button.click();

  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.hover();
  await expect(
    shell.getByText("Do Not Disturb is on until turned off")
  ).toBeVisible();

  standIn.setFeed(ANY_SESSION, listing("2", "1"));
  await retitle(gmail, "Inbox (2)");

  // The count follows held mail.
  await expect.poll(() => readUnreadTotal(app)).toBe(2);
  expect(await captured(app)).toStrictEqual([]);

  await button.click();

  await expect(button).toHaveAttribute("aria-pressed", "false");

  standIn.setFeed(ANY_SESSION, listing("3", "2", "1"));
  await retitle(gmail, "Inbox (3)");

  await expect.poll(() => readUnreadTotal(app)).toBe(3);
  await expect.poll(() => capturedTitles(app)).toStrictEqual(["Sender 3"]);
});

test("with important only, notifies just the new mail the Important feed lists", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, [{ id: "p0", name: "Home" }]);
  await writeSettings(userDataDir, { notificationImportantOnly: true });
  standIn.setFeed(ANY_SESSION, listing("1"));

  const { app, gmail } = await launchOn(launchApp, standIn);
  await expect.poll(() => readUnreadTotal(app)).toBe(1);

  standIn.setFeed(ANY_SESSION, {
    ...listing("3", "2", "1"),
    important: ["2", "1"],
  });
  await retitle(gmail, "Inbox (3)");

  await expect.poll(() => readUnreadTotal(app)).toBe(3);
  await expect.poll(() => capturedTitles(app)).toStrictEqual(["Sender 2"]);
});

const PRIMARY = "^sq_ig_i_personal";

test("on a tabbed inbox, counts and notifies the mail in Primary alone", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, [{ id: "p0", name: "Home" }]);
  standIn.setInboxType('"SECTIONED"');
  standIn.setFeed(ANY_SESSION, { ...listing("2", "1"), primary: ["1"] });

  const { app, gmail } = await launchOn(launchApp, standIn);
  await expect.poll(() => readUnreadTotal(app)).toBe(1);

  // A promotion, then mail in Primary.
  const asked = standIn.feedLabels.length;

  standIn.setFeed(ANY_SESSION, { ...listing("3", "2", "1"), primary: ["1"] });
  await retitle(gmail, "Inbox (1)");
  await expect.poll(() => standIn.feedLabels.length).toBeGreaterThan(asked);
  standIn.setFeed(ANY_SESSION, {
    ...listing("4", "3", "2", "1"),
    primary: ["4", "1"],
  });
  await retitle(gmail, "Inbox (2)");

  await expect.poll(() => readUnreadTotal(app)).toBe(2);
  await expect.poll(() => capturedTitles(app)).toStrictEqual(["Sender 4"]);
  expect(standIn.feedLabels.at(-1)).toBe(PRIMARY);
  await expect
    .poll(() => savedProfiles(userDataDir))
    .toStrictEqual([expect.objectContaining({ id: "p0", tabbedInbox: true })]);
});

test("a profile saved as tabbed reads Primary from its first poll, with no page loaded", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, [
    { id: "p0", name: "Home" },
    { id: "p1", name: "Work", tabbedInbox: true },
  ]);
  standIn.setFeed(ANY_SESSION, { ...listing("2", "1"), primary: ["1"] });

  const { shell } = await launchOn(launchApp, standIn);

  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 1 unread message"
  );
  await expect(profileTab(shell, "Home")).toHaveAccessibleName(
    "Home, 2 unread messages"
  );
  expect(standIn.feedLabels).toContain(PRIMARY);
});

/** Presses the button labelled `label` on the last notification captured. */
const pressAction = (app: ElectronApplication, label: string) =>
  app.evaluate((_electron, wanted) => {
    const notification = (
      Reflect.get(globalThis, "meruTestNotifications") as (Captured & {
        act: (index: number) => void;
      })[]
    ).at(-1);

    notification?.act(notification.actions?.indexOf(wanted) ?? -1);
  }, label);

/** Home alone, with one message notified on its open Gmail page. */
const launchNotified = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn
) => {
  await seedProfiles(userDataDir, [{ id: "p0", name: "Home" }]);
  standIn.setFeed(ANY_SESSION, listing("1"));

  const launched = await launchOn(launchApp, standIn);

  await expect.poll(() => readUnreadTotal(launched.app)).toBe(1);
  standIn.setFeed(ANY_SESSION, listing("2", "1"));
  standIn.setFeedAfterAction(ANY_SESSION, listing("1"));
  await retitle(launched.gmail, "Inbox (2)");
  await expect
    .poll(() => capturedTitles(launched.app))
    .toStrictEqual(["Sender 2"]);

  return launched;
};

/** Longer than main waits between two catch-ups of a profile's page. */
const PAST_CATCH_UP_MS = 500;

test("an action from a notification has the open page press Gmail's Refresh once, keeping the draft and its focus", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, gmail } = await launchNotified(launchApp, userDataDir, standIn);
  const draft = gmail.getByRole("textbox", { name: DRAFT_LABEL });

  await expect(gmail.getByText(refreshedTimes(0))).toBeVisible();
  await draft.fill("Half a reply");
  await draft.focus();
  await pressAction(app, "Mark as Read");

  await expect(gmail.getByText(refreshedTimes(1))).toBeVisible();
  await expect(draft).toHaveValue("Half a reply");
  await expect(draft).toBeFocused();
  expect(standIn.actions).toHaveLength(1);

  await gmail.waitForTimeout(PAST_CATCH_UP_MS);

  await expect(gmail.getByText(refreshedTimes(1))).toBeVisible();
});

test("waking has each open Gmail page press Refresh", async ({
  app,
  standIn,
}) => {
  const gmail = await findPage(app, standIn.url);

  await expect(gmail.getByText(refreshedTimes(0))).toBeVisible();
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });

  await expect(gmail.getByText(refreshedTimes(1))).toBeVisible();
});

test("a page whose Refresh Gmail renamed is reported broken there, and neither an action Gmail takes nor one it refuses presses anything", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  standIn.renameRefresh();

  const { app, gmail } = await launchNotified(launchApp, userDataDir, standIn);
  const draft = gmail.getByRole("textbox", { name: DRAFT_LABEL });

  await expect
    .poll(() =>
      app.evaluate(
        () =>
          (
            Reflect.get(globalThis, "meruTestGmailPage") as {
              health: { hooks: Record<string, string> }[];
            }
          ).health.at(-1)?.hooks.refresh
      )
    )
    .toBe("broken");
  await draft.fill("Half a reply");
  await draft.focus();
  await pressAction(app, "Mark as Read");
  await expect.poll(() => standIn.actions).toHaveLength(1);
  await gmail.waitForTimeout(PAST_CATCH_UP_MS);

  await expect(draft).toHaveValue("Half a reply");
  await expect(draft).toBeFocused();
  await expect(gmail.getByText(refreshedTimes(0))).toBeVisible();

  standIn.failActions(ANY_SESSION);
  standIn.setFeed(ANY_SESSION, listing("3", "2", "1"));
  await retitle(gmail, "Inbox (3)");
  await expect
    .poll(() => capturedTitles(app))
    .toStrictEqual(["Sender 2", "Sender 3"]);

  await pressAction(app, "Archive");
  await expect.poll(() => standIn.refusedActions).toHaveLength(1);
  await gmail.waitForTimeout(PAST_CATCH_UP_MS);

  await expect(gmail.getByText(refreshedTimes(0))).toBeVisible();
});

test("counts the whole inbox for a poll that finds no Primary feed", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, [{ id: "p0", name: "Home" }]);
  standIn.setInboxType('"SECTIONED"');
  standIn.setFeed(ANY_SESSION, listing("2", "1"));

  const { app, gmail } = await launchOn(launchApp, standIn);

  await retitle(gmail, "Inbox (2)");
  await expect
    .poll(() => standIn.feedLabels.slice(-2))
    .toStrictEqual([PRIMARY, ""]);
  await expect.poll(() => readUnreadTotal(app)).toBe(2);
});
