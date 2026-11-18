import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuItem,
  readState,
  readViews,
  shownViews,
  test,
  writeState,
} from "./lib/app.ts";
import { ANY_SESSION, listing, message, messageLink } from "./lib/stand-in.ts";

const profileButton = (shell: Page, name: string) =>
  shell
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}`, "u") });

/** The partition of each content view, in the window's order. */
const viewPartitions = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views.map(({ partition }) => partition);
};

/** The renderer processes the app runs, the shell's and the overlay's too. */
const countRenderers = (app: ElectronApplication) =>
  app.evaluate(
    ({ app: electronApp }) =>
      electronApp.getAppMetrics().filter((metric) => metric.type === "Tab")
        .length
  );

/** Clicks the captured notification whose subtitle or body names `name`. */
const clickNotification = (app: ElectronApplication, name: string) =>
  app.evaluate((_electron, wanted) => {
    const notifications = Reflect.get(globalThis, "meruTestNotifications") as {
      title: string;
      subtitle?: string;
      body: string;
      click: () => void;
    }[];

    notifications
      .find(
        ({ subtitle, body }) =>
          subtitle === wanted || body.startsWith(`${wanted}\n`)
      )
      ?.click();
  }, name);

const notified = (app: ElectronApplication) =>
  app.evaluate(
    () => (Reflect.get(globalThis, "meruTestNotifications") as unknown[]).length
  );

/** Right-clicks the profile's button and chooses the item of its menu. */
const choose = async (
  app: ElectronApplication,
  shell: Page,
  name: string,
  label: string
) => {
  await profileButton(shell, name).click({ button: "right" });

  const overlay = await findOverlayDocument(app);
  const menu = overlay.getByRole("menu", { name });

  await expect(menu).toBeVisible();
  await expect(overlay.getByRole("menuitem")).toHaveText([label]);
  await overlay.getByRole("menuitem", { name: label, exact: true }).click();
  await expect(menu).toHaveCount(0);
};

test("Sleep in a background profile's menu closes its views and renderer and dims its button, whose badge keeps counting, and a notification's click wakes and selects it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      { id: "p1", name: "Work" },
    ],
    selectedProfileId: "p0",
  });
  standIn.setFeed(ANY_SESSION, listing("1"));

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const work = profileButton(shell, "Work");

  // Work's Gmail loads on its first selection.
  await work.click();
  await profileButton(shell, "Home").click();
  await expect
    .poll(() => viewPartitions(app))
    .toStrictEqual(["persist:p0", "persist:p1"]);
  await expect(work).toHaveAccessibleName("Work, 1 unread message");

  // The shell's, which the overlay shares, and each profile's Gmail, once
  // Chromium has counted Work's.
  await expect.poll(() => countRenderers(app)).toBe(3);
  await choose(app, shell, "Work", "Sleep");

  await expect.poll(() => viewPartitions(app)).toStrictEqual(["persist:p0"]);
  await expect.poll(() => countRenderers(app)).toBe(2);
  await expect(work).toHaveCSS("opacity", "0.5");
  await expect(work).toHaveAccessibleName("Work, asleep, 1 unread message");
  await expect(work).toHaveAttribute("title", /^Work, asleep/u);
  await expect(work).toBeFocused();
  await expect(profileButton(shell, "Home")).toHaveCSS("opacity", "1");
  await expect(profileButton(shell, "Home")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  standIn.setFeed(ANY_SESSION, {
    unreadCount: 2,
    mail: [message("2"), message("1")],
  });
  // Waking polls every profile, the sleeping one among them.
  await app.evaluate(({ powerMonitor }) => {
    powerMonitor.emit("resume");
  });

  await expect(work).toHaveAccessibleName("Work, asleep, 2 unread messages");
  await expect.poll(() => notified(app)).toBe(2);

  await clickNotification(app, "Work");

  await expect(work).toHaveAttribute("aria-pressed", "true");
  await expect(work).toHaveCSS("opacity", "1");
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([
      { url: messageLink(standIn.url, "2"), partition: "persist:p1" },
    ]);
});

test("Sleep Profile on the selected profile selects the first awake one in the row, and Next Profile landing on it wakes it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      { id: "p1", name: "Work" },
      { id: "p2", name: "Dev" },
    ],
    selectedProfileId: "p1",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await expect.poll(() => viewPartitions(app)).toStrictEqual(["persist:p1"]);
  expect(await readMenuItem(app, "profile.sleep")).toMatchObject({
    label: "Sleep Profile",
    enabled: true,
  });

  await clickMenuItem(app, "profile.sleep");

  await expect(profileButton(shell, "Home")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(profileButton(shell, "Work")).toHaveCSS("opacity", "0.5");
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p0" }]);
  await expect.poll(() => viewPartitions(app)).toStrictEqual(["persist:p0"]);

  await clickMenuItem(app, "profile.next");

  await expect(profileButton(shell, "Work")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(profileButton(shell, "Work")).toHaveCSS("opacity", "1");
  await expect
    .poll(() => shownViews(app))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p1" }]);
});

test("Sleep is disabled for the last awake profile, in its menu and the Window menu, and with a single profile", async ({
  launchApp,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      { id: "p1", name: "Work", asleep: true },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await expect(profileButton(shell, "Work")).toHaveCSS("opacity", "0.5");
  await expect
    .poll(() => readMenuItem(app, "profile.sleep"))
    .toMatchObject({ label: "Sleep Profile", enabled: false });

  await profileButton(shell, "Home").click({ button: "right" });

  const overlay = await findOverlayDocument(app);

  await expect(overlay.getByRole("menu", { name: "Home" })).toBeVisible();
  await expect(
    overlay.getByRole("menuitem", { name: "Sleep", exact: true })
  ).toBeDisabled();
  await overlay.keyboard.press("Escape");
  await app.close();

  await writeState(userDataDir, {
    profiles: [{ id: "p0", name: "Home" }],
    selectedProfileId: "p0",
  });

  const single = await launchApp();

  await findPage(single, "meru-app:");
  await expect
    .poll(() => readMenuItem(single, "profile.sleep"))
    .toMatchObject({ enabled: false });
});

test("a restart keeps a profile asleep, loading nothing of it until it is selected, and a file storing the selected one asleep loads it awake", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      { id: "p1", name: "Work" },
    ],
    selectedProfileId: "p0",
  });

  const first = await launchApp();
  const firstShell = await findPage(first, "meru-app:");

  await findPage(first, standIn.url);
  await choose(first, firstShell, "Work", "Sleep");
  await expect
    .poll(async () => {
      const { profiles } = await readState<{
        profiles: { asleep?: boolean }[];
      }>(userDataDir);

      return profiles.map((profile) => profile.asleep);
    })
    .toStrictEqual([undefined, true]);
  await first.close();

  const second = await launchApp();
  const shell = await findPage(second, "meru-app:");

  await expect(profileButton(shell, "Work")).toHaveAccessibleName(
    "Work, asleep, sign in required"
  );
  await expect.poll(() => viewPartitions(second)).toStrictEqual(["persist:p0"]);

  await profileButton(shell, "Work").click();

  await expect
    .poll(() => shownViews(second))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p1" }]);
  await second.close();

  // Every profile asleep, as a hand-edited file could have them.
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home", asleep: true },
      { id: "p1", name: "Work", asleep: true },
    ],
    selectedProfileId: "p0",
  });

  const third = await launchApp();
  const thirdShell = await findPage(third, "meru-app:");

  await expect
    .poll(() => shownViews(third))
    .toStrictEqual([{ url: standIn.url, partition: "persist:p0" }]);
  await expect(profileButton(thirdShell, "Home")).toHaveCSS("opacity", "1");
  await expect(profileButton(thirdShell, "Work")).toHaveCSS("opacity", "0.5");
});

test("Shift+F10 and the Menu key on a focused profile button open its menu below it, and Escape gives focus back to the button", async ({
  launchApp,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      { id: "p0", name: "Home" },
      { id: "p1", name: "Work" },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const work = profileButton(shell, "Work");

  await work.focus();
  await work.press("Shift+F10");

  const overlay = await findOverlayDocument(app);
  const menu = overlay.getByRole("menu", { name: "Work" });

  await expect(menu).toBeVisible();
  await expect
    .poll(() =>
      menu.evaluate((element) => element.contains(document.activeElement))
    )
    .toBe(true);
  await overlay.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(work).toBeFocused();
  await work.press("ContextMenu");
  await expect(menu).toBeVisible();
});
