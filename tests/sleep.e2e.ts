import type { ElectronApplication, Page } from "@playwright/test";

import { tabs } from "../app/shared/channels/profiles.ts";
import { invokeIn, runCommand, valueOf } from "../scripts/lib/app.ts";
import { expect, must, panesOf, profilesOf, test } from "./app.ts";

/** The address the web contents shows. */
const urlOf = async (app: ElectronApplication, contentsId: number) =>
  await app.evaluate(
    ({ webContents }, id) => webContents.fromId(id)?.getURL() ?? "",
    contentsId
  );

const shownTabs = async (app: ElectronApplication) => {
  const panes = await panesOf(app);
  return panes.map((pane) => pane.tabId);
};

const asleepOf = async (chrome: Page, tabId: string) => {
  const { tabs: all } = await profilesOf(chrome);
  return all.find((tab) => tab.id === tabId)?.asleep;
};

// A minute of `sleep.afterMinutes` lasts half a second here, so the tab falls asleep within the test.
test("puts a tab the user let sleep to sleep once out of sight, and wakes it with a new page at its address when shown", async ({
  launch,
}) => {
  const { app, chrome } = await launch({
    env: { MERU_SLEEP_MINUTE: "500" },
    settings: { global: { "sleep.afterMinutes": 1 }, profiles: {} },
  });
  await expect.poll(async () => await panesOf(app)).toHaveLength(1);
  const {
    selectedProfileId,
    tabs: [gmail],
  } = await profilesOf(chrome);
  const gmailId = must(gmail, "The Gmail tab").id;
  const drive = valueOf(
    await invokeIn(chrome, tabs.add, {
      appId: "drive",
      profileId: selectedProfileId,
    })
  );
  await invokeIn(chrome, tabs.focus, { tabId: drive.id });
  await expect.poll(async () => await shownTabs(app)).toStrictEqual([drive.id]);
  const [awake] = await panesOf(app);
  const before = must(awake, "Drive's pane").contentsId;
  const address = await urlOf(app, before);
  valueOf(await runCommand(chrome, "sleep.toggleTab"));

  await invokeIn(chrome, tabs.focus, { tabId: gmailId });
  await expect.poll(async () => await asleepOf(chrome, drive.id)).toBe(true);
  expect(
    await app.evaluate(
      ({ webContents }, id) => webContents.fromId(id) === undefined,
      before
    )
  ).toBe(true);

  await invokeIn(chrome, tabs.focus, { tabId: drive.id });
  await expect.poll(async () => await shownTabs(app)).toStrictEqual([drive.id]);
  const [woken] = await panesOf(app);
  const after = must(woken, "Drive's woken pane").contentsId;
  expect([
    after === before,
    await urlOf(app, after),
    await asleepOf(chrome, drive.id),
  ]).toStrictEqual([false, address, false]);
});
