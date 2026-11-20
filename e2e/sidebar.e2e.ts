import type { ElectronApplication, Page } from "@playwright/test";
import { isEqual } from "es-toolkit";

import { contentViewBounds } from "#core/layout.ts";
import type { Platform } from "#core/platform.ts";
import { sidebarWidth } from "#core/sidebar.ts";
import type { SidebarState } from "#core/sidebar.ts";

import { expect, findPage, readViews, test, writeState } from "./lib/app.ts";

const platform = process.platform as Platform;

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

      return [
        bounds?.x,
        isEqual(bounds, contentViewBounds(area, state, platform)),
      ];
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
    shell
      .getByRole("group", { name: "Profiles" })
      .getByRole("button", { name });

  await findPage(app, standIn.url);
  await expectSidebar(app, shell, "hidden", 8);

  await profile("Two").click();
  await expectSidebar(app, shell, "narrow", sidebarWidth("narrow", platform));

  const toggle = shell.getByRole("button", { name: "Sidebar", exact: true });
  const toggleBox = await toggle.boundingBox();
  const { bounds } = await frontView(app);

  // Elsewhere the toggle sits 8px from the window's edge, too near to line
  // the page up with, so the column keeps its own width.
  expect(bounds?.x).toBe(platform === "darwin" ? toggleBox?.x : 64);

  await profile("Three").click();
  await expectSidebar(app, shell, "wide", 224);

  await toggle.click();
  await expectSidebar(app, shell, "hidden", 8);

  await toggle.click();
  await expectSidebar(app, shell, "wide", 224);
});

/** Presses `keyCode` with `modifiers` in the page at `url`, as the system hands keys to it. */
const pressInPage = (
  app: ElectronApplication,
  url: string,
  keyCode: string,
  modifiers: ("meta" | "control" | "alt")[]
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(request.url));

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode: request.keyCode,
          modifiers: request.modifiers,
        });
      }
    },
    { url, keyCode, modifiers }
  );

test("Cmd or Ctrl+S reaches the page, where Google's apps save, and Ctrl+Cmd+L, or Ctrl+Alt+D, shows the sidebar", async ({
  app,
  shell,
  standIn,
}) => {
  const isMacOS = process.platform === "darwin";
  const gmail = await findPage(app, standIn.url);

  await gmail.evaluate(() => {
    const seen: string[] = [];

    Reflect.set(globalThis, "seenKeys", seen);
    document.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey) {
        seen.push(event.key.toLowerCase());
      }
    });
  });
  await expectSidebar(app, shell, "hidden", 8);

  await pressInPage(app, standIn.url, "S", [isMacOS ? "meta" : "control"]);
  await expect
    .poll(() => gmail.evaluate(() => Reflect.get(globalThis, "seenKeys")))
    .toContain("s");
  await expectSidebar(app, shell, "hidden", 8);

  await pressInPage(
    app,
    standIn.url,
    isMacOS ? "L" : "D",
    isMacOS ? ["control", "meta"] : ["control", "alt"]
  );
  await expectSidebar(app, shell, "narrow", sidebarWidth("narrow", platform));
});
