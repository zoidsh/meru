import { expect, test } from "./lib/app.ts";

test("a second instance on the same user data exits and leaves the first running", async ({
  app,
  shell,
  spawnApp,
}) => {
  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();

  expect(await spawnApp().exited).toBe(0);
  expect(app.process().exitCode).toBeNull();
  expect(app.windows()).toHaveLength(1);
  await expect(shell.getByRole("main", { name: "Content" })).toBeVisible();
});
