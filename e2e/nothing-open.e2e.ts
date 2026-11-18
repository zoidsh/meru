import {
  clickMenuItem,
  expect,
  findPage,
  readState,
  shownViews,
  test,
  writeState,
} from "./lib/app.ts";
import { signIn } from "./lib/stand-in.ts";

test("a profile with no app open says Sign in required while its account is signed out, whose Sign in opens Gmail, and No apps open, naming it, once signed in", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home", tabs: [], selectedTabId: "" },
      { id: "p1", name: "Work", tabs: [], selectedTabId: "" },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const signInRequired = shell.getByRole("region", {
    name: "Sign in required",
  });
  const nothingOpen = shell.getByRole("region", { name: "No apps open" });

  await expect(signInRequired).toBeVisible();
  await expect(
    signInRequired.getByText(
      "Home's Google account is signed out, so its mail is not checked."
    )
  ).toBeVisible();
  await expect(
    signInRequired.getByRole("button", { name: "Open app" })
  ).toBeVisible();

  await signIn(app, standIn, "p0");
  standIn.setFeed("persist:p0", { unreadCount: 0 });
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });

  await expect(nothingOpen).toBeVisible();
  await expect(
    nothingOpen.getByText("Open Gmail, Calendar or another Google app in Home.")
  ).toBeVisible();
  await expect(nothingOpen.getByRole("button")).toHaveText([/^Open app/u]);

  await clickMenuItem(app, "profile.next");
  await expect(
    signInRequired.getByText(
      "Work's Google account is signed out, so its mail is not checked."
    )
  ).toBeVisible();
  await signInRequired.getByRole("button", { name: "Sign in" }).click();

  await expect
    .poll(() =>
      shownViews(app).then((views) => views.map((view) => view.partition))
    )
    .toStrictEqual(["persist:p1"]);
  await expect(signInRequired).toHaveCount(0);
  await expect
    .poll(async () => {
      const { profiles } = await readState<{
        profiles: { tabs: { id: string }[]; selectedTabId: string }[];
      }>(userDataDir);

      return profiles.map((profile) => [
        profile.tabs.map((tab) => tab.id),
        profile.selectedTabId,
      ]);
    })
    .toStrictEqual([
      [[], ""],
      [["gmail"], "gmail"],
    ]);
});

test("a profile with no app open shows nothing there until its first poll ends", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [{ id: "p0", name: "Home", tabs: [], selectedTabId: "" }],
    selectedProfileId: "p0",
  });

  const release = standIn.holdFeeds();
  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const content = shell.getByRole("main", { name: "Content" });

  await expect.poll(() => standIn.feedLabels.length).toBeGreaterThan(0);
  await expect(content.getByRole("heading")).toHaveCount(0);

  release();

  await expect(
    content.getByRole("region", { name: "Sign in required" })
  ).toBeVisible();
});
