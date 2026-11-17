import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { expect, findPage, test } from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { ACCOUNT_COOKIE } from "./lib/stand-in.ts";

const PROFILES = [
  { id: "p0", name: "Home" },
  { id: "p1", name: "Work" },
];

/** Starts the app on Home and Work, Home selected. */
const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string
) => {
  await writeFile(
    path.join(userDataDir, "state.json"),
    JSON.stringify({ version: 1, profiles: PROFILES, selectedProfileId: "p0" })
  );

  const app = await launchApp();

  return { app, shell: await findPage(app, "meru-app:") };
};

/** Signs the profile's session in to the stand-in's feed as `account`. */
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

/** Sets the title of the profile's Gmail page, as Gmail does as mail comes. */
const retitle = (
  app: ElectronApplication,
  standIn: StandIn,
  profileId: string,
  title: string
) =>
  app.evaluate(
    async ({ session, webContents }, { partition, url, next }) => {
      const page = webContents
        .getAllWebContents()
        .find(
          (candidate) =>
            candidate.session === session.fromPartition(partition) &&
            candidate.getURL().startsWith(url)
        );

      if (!page) {
        throw new Error(`No Gmail page in ${partition}`);
      }

      await page.executeJavaScript(`document.title = ${JSON.stringify(next)}`);
    },
    { partition: `persist:${profileId}`, url: standIn.url, next: title }
  );

const profileTab = (shell: Page, name: string) =>
  shell
    .getByRole("tablist", { name: "Profiles" })
    .getByRole("tab", { name: new RegExp(`^${name}`, "u") });

test("shows a profile's unread count and follows it as the page's title changes", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const home = profileTab(shell, "Home");

  await findPage(app, standIn.url);
  await signIn(app, standIn, "p0");
  standIn.setFeed("persist:p0", { unreadCount: 120 });
  await retitle(app, standIn, "p0", "Inbox (120)");

  await expect(home).toHaveAccessibleName("Home, 120 unread messages");
  await expect(home).toHaveText("Home99+");

  standIn.setFeed("persist:p0", { unreadCount: 1 });
  await retitle(app, standIn, "p0", "Inbox (1)");

  await expect(home).toHaveAccessibleName("Home, 1 unread message");
  await expect(home).toHaveText("Home1");

  standIn.setFeed("persist:p0", { unreadCount: 0 });
  await retitle(app, standIn, "p0", "Inbox");

  await expect(home).toHaveAccessibleName("Home");
  await expect(home).toHaveText("Home");
});

test("gives each profile its own count", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);

  await signIn(app, standIn, "p0");
  await signIn(app, standIn, "p1");
  standIn.setFeed("persist:p0", { unreadCount: 2 });
  standIn.setFeed("persist:p1", { unreadCount: 7 });
  await findPage(app, standIn.url);
  await retitle(app, standIn, "p0", "Inbox (2)");

  await expect(profileTab(shell, "Home")).toHaveAccessibleName(
    "Home, 2 unread messages"
  );
  // Its Gmail tab loading for the first time polls it.
  await profileTab(shell, "Work").click();

  await expect(profileTab(shell, "Work")).toHaveAccessibleName(
    "Work, 7 unread messages"
  );
  await expect(profileTab(shell, "Home")).toHaveAccessibleName(
    "Home, 2 unread messages"
  );
});

test("shows no count once the feed sends the session to sign in", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const home = profileTab(shell, "Home");

  await findPage(app, standIn.url);
  await signIn(app, standIn, "p0");
  standIn.setFeed("persist:p0", { unreadCount: 5 });
  await retitle(app, standIn, "p0", "Inbox (5)");

  await expect(home).toHaveAccessibleName("Home, 5 unread messages");

  standIn.setFeed("persist:p0", { redirect: true });
  await retitle(app, standIn, "p0", "Sign in");

  await expect(home).toHaveAccessibleName("Home");
  await expect(home).toHaveText("Home");
});
