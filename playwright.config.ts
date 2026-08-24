import { createHash } from "node:crypto";
import { ms } from "@meru/shared/ms";
import { defineConfig } from "@playwright/test";

/*
 * Playwright has to know the dev server's URL before it starts it, so the port
 * cannot be discovered after the fact the way `bun run dev` discovers it.
 * Deriving it from the checkout path gives every worktree its own — several
 * agents work on this repository at once — and keeps it stable across runs of
 * the same checkout, which is what makes reusing a running server safe.
 */
const rendererPort =
  3100 + (createHash("sha256").update(process.cwd()).digest().readUInt16BE(0) % 400);

export const rendererUrl = `http://127.0.0.1:${rendererPort}/`;

export default defineConfig({
  testDir: "tests",
  // The app takes a single instance lock, so two of these cannot overlap within
  // one checkout however many workers are free.
  workers: 1,
  fullyParallel: false,
  // Generous because a fresh checkout downloads the Electron binary on the
  // first require, so this covers that as well as the boot.
  timeout: ms("5m"),
  expect: {
    timeout: ms("1m"),
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: `bun run scripts/dev-server.ts --port ${rendererPort}`,
    // A page rather than the root, because the renderer has an entry per window
    // and no index.html, so "/" is a 404 and would never look ready.
    url: `${rendererUrl}main.html`,
    // The port belongs to this checkout, so a server already on it is this
    // checkout's own and reusing it just saves a rebuild. CI always starts one.
    reuseExistingServer: !process.env.CI,
    timeout: ms("2m"),
    stdout: "pipe",
    stderr: "pipe",
  },
});
