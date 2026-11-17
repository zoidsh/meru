import type { ElectronApplication, Page } from "@playwright/test";
import { isEqual } from "es-toolkit";

import { contentViewBounds } from "#core/layout.ts";
import type { SidebarState } from "#core/sidebar.ts";

import { expect, findPage, readViews, test, writeState } from "./lib/app.ts";

/** Where the shown view sits, beside what the window's content area is. */
const frontView = async (app: ElectronApplication) => {
  const { area, views } = await readViews(app);

  return {
    bounds: views.find((view) => view.visible)?.bounds,
    area,
  };
};

const expectSidebar = async (
  app: ElectronApplication,
  shell: Page,
  state: SidebarState,
  left: number
) => {
  await expect
    .poll(async () => {
      const { bounds, area } = await frontView(app);

      return [bounds?.x, isEqual(bounds, contentViewBounds(area, state))];
    })
    .toStrictEqual([left, true]);
  await expect(shell.getByRole("tablist", { name: "Tabs" })).toHaveCount(
    state === "hidden" ? 0 : 1
  );
  await expect(
    shell.getByRole("button", { name: "Sidebar", exact: true })
  ).toHaveAttribute("aria-pressed", String(state !== "hidden"));
};

test("the sidebar is hidden for one tab, narrow for two apps and wide for two tabs of one app, and the titlebar's toggle hides and shows it with the view following", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const gmail = { id: "gmail", app: "gmail", url: standIn.url, title: "" };
  const calendar = (id: string) => ({
    id,
    app: "calendar",
    url: standIn.calendarUrl,
    title: id,
  });

  await writeState(userDataDir, {
    profiles: [
      { id: "one", name: "One", tabs: [gmail] },
      { id: "two", name: "Two", tabs: [gmail, calendar("c1")] },
      {
        id: "three",
        name: "Three",
        tabs: [gmail, calendar("c1"), calendar("c2")],
      },
    ],
    selectedProfileId: "one",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const profile = (name: string) =>
    shell.getByRole("tablist", { name: "Profiles" }).getByRole("tab", { name });

  await findPage(app, standIn.url);
  await expectSidebar(app, shell, "hidden", 8);

  await profile("Two").click();
  await expectSidebar(app, shell, "narrow", 64);

  await profile("Three").click();
  await expectSidebar(app, shell, "wide", 224);

  const toggle = shell.getByRole("button", { name: "Sidebar", exact: true });

  await toggle.click();
  await expectSidebar(app, shell, "hidden", 8);

  await toggle.click();
  await expectSidebar(app, shell, "wide", 224);
});
