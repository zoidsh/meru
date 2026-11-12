import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";

const root = path.join(import.meta.dirname, "..");

test("opens one window showing Meru", async () => {
  const userData = await mkdtemp(path.join(tmpdir(), "meru-e2e-"));
  // chrome-sandbox ships without its setuid bit outside an installed package, so an unpacked Linux run cannot use the sandbox.
  const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await electron.launch({
    args: [root, `--user-data-dir=${userData}`, ...sandbox],
    env: { ...process.env, MERU_BACKGROUND: "1", MERU_TEST_BACKGROUND: "1" },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.locator("h1")).toHaveText("Meru");
    await expect(window).toHaveTitle("Meru");
    await expect(window.locator("body")).toContainText(
      `Running on ${process.platform}`
    );
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
    await rm(userData, { force: true, recursive: true });
  }
});
