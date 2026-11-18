import path from "node:path";

import type { ElectronApplication } from "@playwright/test";
import { delay } from "es-toolkit";

import { test } from "./app.ts";

const SHOTS = path.join(
  import.meta.dirname,
  "..",
  "..",
  "test-results",
  "shots"
);

export type Theme = "light" | "dark";

export const THEMES: Theme[] = ["light", "dark"];

/** Skips the test unless `MERU_E2E_SHOTS=1`; a shot asserts nothing of the picture. */
export const onlyWithShots = () => {
  test.skip(
    process.env.MERU_E2E_SHOTS !== "1",
    "Screenshots are taken with MERU_E2E_SHOTS=1"
  );
};

/** `test-results/shots/<surface>[-<theme>].png`. */
export const shotPath = (surface: string, theme?: Theme) =>
  path.join(SHOTS, `${[surface, theme].filter(Boolean).join("-")}.png`);

/** Has every page of the app take the scheme, as Playwright emulates it. */
export const emulateTheme = async (app: ElectronApplication, theme: Theme) => {
  await Promise.all(
    app.windows().map((page) => page.emulateMedia({ colorScheme: theme }))
  );
  // Lets the colour transitions the scheme starts finish.
  await delay(500);
};

export { shootOwnWindow, shootWindow } from "./window-shot.ts";
