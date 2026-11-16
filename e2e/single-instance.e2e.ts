import { expect, launchArgs, spawnApp, test } from "./lib/app.ts";

test("a second instance on the same user data exits and leaves the first running", async ({
  app,
  shell,
  userDataDir,
}) => {
  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();

  const second = spawnApp(launchArgs(userDataDir));

  try {
    expect(await second.exited).toBe(0);
  } finally {
    await second.stop();
  }

  expect(app.process().exitCode).toBeNull();
  expect(app.windows()).toHaveLength(1);
  await expect(shell.getByRole("main", { name: "Content" })).toBeVisible();
});
