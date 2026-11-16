import { createContentSecurityPolicy } from "../packages/main/src/content-security-policy.ts";
import { expect, test } from "./lib/app.ts";

test("opens the shell window with its title bar and content landmarks", async ({
  shell,
}) => {
  await expect(shell).toHaveTitle("Meru");
  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();
  await expect(shell.getByRole("main", { name: "Content" })).toBeVisible();
});

test("serves the shell from meru-app:// under the strict policy, with no console error", async ({
  shell,
}) => {
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
});
