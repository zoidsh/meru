import type { Page } from "@playwright/test";

import { expect, findPage, test, writeState } from "./lib/app.ts";

const titlebar = (shell: Page) =>
  shell.getByRole("banner", { name: "Title bar" });

test("with two profiles a click selects the other and the shell takes its colour; Back and Forward follow the page's history, and Reload loads it again", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p0",
        name: "Home",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "c",
      },
      { id: "p1", name: "Work" },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const bar = titlebar(shell);
  const profile = (name: string) =>
    bar
      .getByRole("group", { name: "Profiles" })
      .getByRole("button", { name: new RegExp(`^${name}`, "u") });
  const back = bar.getByRole("button", { name: "Back" });
  const forward = bar.getByRole("button", { name: "Forward" });
  // Named Stop while the page loads.
  const reload = bar.getByRole("button", { name: "Reload" });
  const calendar = await findPage(app, standIn.calendarUrl);

  await expect(reload).toBeEnabled();
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();

  await calendar.getByRole("link", { name: "Next week" }).click();

  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

  await back.click();

  await expect(forward).toBeEnabled();
  await expect(back).toBeDisabled();
  await expect(reload).toBeEnabled();

  const before = standIn.requests().calendar;

  await reload.click();

  await expect.poll(() => standIn.requests().calendar).toBe(before + 1);
  await expect(reload).toBeEnabled();

  const shellColour = () =>
    bar.evaluate((element) => getComputedStyle(element).backgroundColor);
  const homeColour = await shellColour();

  await expect(profile("Home")).toHaveAttribute("aria-pressed", "true");
  await profile("Work").click();

  await expect(profile("Work")).toHaveAttribute("aria-pressed", "true");
  await expect(profile("Home")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(shellColour).not.toBe(homeColour);
  // Work's Gmail page has no history yet.
  await expect(back).toBeDisabled();
});
