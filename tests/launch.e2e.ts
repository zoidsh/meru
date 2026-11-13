import { expect, test } from "@playwright/test";

import { launch, profilesOf, stageOf, viewsOf } from "./app.ts";

test("opens a fresh install in one window on one profile with one Gmail tab in one pane", async () => {
  const { app, chrome, close } = await launch();
  try {
    await expect(chrome).toHaveTitle("Meru");
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(1);
    const windows = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    );
    const [state, stage] = await Promise.all([
      profilesOf(chrome),
      stageOf(chrome),
    ]);
    expect({
      groups: state.groups.map((group) => group.tabIds.length),
      panes: stage.panes.length,
      profiles: state.profiles.map((profile) => profile.label),
      tabs: state.tabs.map((tab) => tab.appId),
      windows,
    }).toStrictEqual({
      groups: [1],
      panes: 1,
      profiles: ["Personal"],
      tabs: ["gmail"],
      windows: 1,
    });
  } finally {
    await close();
  }
});
