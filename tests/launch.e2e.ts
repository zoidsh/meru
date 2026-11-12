import { expect, test } from "@playwright/test";

import { launch, viewsOf } from "./app.ts";

test("opens one window showing one pane", async () => {
  const { app, chrome, close } = await launch();
  try {
    await expect(chrome).toHaveTitle("Meru");
    const windows = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    );
    expect(windows).toBe(1);
    await expect.poll(async () => await viewsOf(chrome)).toHaveLength(1);
  } finally {
    await close();
  }
});
