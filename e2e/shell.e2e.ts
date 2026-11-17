import { createContentSecurityPolicy } from "#main/content-security-policy.ts";

import { expect, test } from "./lib/app.ts";

test("opens the shell window, named for a development build, with its title bar and content landmarks, served from meru-app:// under the strict policy with no console error; a second instance exits and leaves it running", async ({
  app,
  shell,
  spawnApp,
}) => {
  expect(
    await app.evaluate(({ app: electronApp, BrowserWindow }) => [
      electronApp.getName(),
      BrowserWindow.getAllWindows().map((window) => window.getTitle()),
    ])
  ).toStrictEqual(["Meru Dev", ["Meru Dev"]]);
  // Core parses URLs with `URL.parse`, in main and in what a preload may import.
  expect(await app.evaluate(() => typeof URL.parse)).toBe("function");
  expect(await shell.evaluate(() => typeof URL.parse)).toBe("function");
  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();
  await expect(shell.getByRole("main", { name: "Content" })).toBeVisible();

  const errors: string[] = [];

  shell.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  shell.on("pageerror", (error) => {
    errors.push(error.message);
  });

  // The listeners missed the first load.
  await shell.reload();
  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();

  expect(new URL(shell.url()).protocol).toBe("meru-app:");

  const policy = await shell.evaluate(async () => {
    const response = await fetch(location.href);

    return response.headers.get("content-security-policy");
  });

  expect(policy).toBe(createContentSecurityPolicy());
  expect(errors).toStrictEqual([]);

  expect(await spawnApp().exited).toBe(0);
  expect(app.process().exitCode).toBeNull();
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    )
  ).toBe(1);
  await expect(shell.getByRole("main", { name: "Content" })).toBeVisible();
});
