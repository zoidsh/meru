import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import { test } from "./app.ts";

const SHOTS = path.join(
  import.meta.dirname,
  "..",
  "..",
  "test-results",
  "shots"
);

export type Design = "modern" | "classic";

export type Theme = "light" | "dark";

export const DESIGNS: Design[] = ["modern", "classic"];

export const THEMES: Theme[] = ["light", "dark"];

/** Skips the test unless `MERU_E2E_SHOTS=1`; a shot asserts nothing of the picture. */
export const onlyWithShots = () => {
  test.skip(
    process.env.MERU_E2E_SHOTS !== "1",
    "Screenshots are taken with MERU_E2E_SHOTS=1"
  );
};

/** `test-results/shots/<surface>[-<design>][-<theme>].png`. */
export const shotPath = (surface: string, design?: Design, theme?: Theme) =>
  path.join(SHOTS, `${[surface, design, theme].filter(Boolean).join("-")}.png`);

/** Has every page of the app take the scheme, as Playwright emulates it. */
export const emulateTheme = async (app: ElectronApplication, theme: Theme) => {
  await Promise.all(
    app.windows().map((page) => page.emulateMedia({ colorScheme: theme }))
  );
  // Lets the colour transitions the scheme starts finish.
  await delay(500);
};

/**
 * The shell window as a person sees it, never the display: the window's
 * `capturePage()` holds the shell's page alone, so each view shown over it,
 * a tab's page or the overlay's, is captured too and drawn where it sits, in
 * order, by the shell's renderer on a canvas no one sees.
 */
export const shootWindow = async (
  app: ElectronApplication,
  shell: Page,
  file: string
) => {
  const layers = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().startsWith("meru-app:")
    );

    if (!window) {
      throw new Error("The app has no shell window");
    }

    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in main, which sees nothing outside
    const png = async (contents: Electron.WebContents) => {
      const image = await contents.capturePage();

      return image.toPNG().toString("base64");
    };
    const views = window.contentView.children
      .map((view) => view as Electron.WebContentsView)
      .filter((view) => view.getVisible() && view.webContents);

    return {
      area: window.contentView.getBounds(),
      shell: await png(window.webContents),
      views: await Promise.all(
        views.map(async (view) => ({
          png: await png(view.webContents),
          bounds: view.getBounds(),
        }))
      ),
    };
  });

  const composed = await shell.evaluate(
    async ({ area, shell: base, views }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the shell, which sees nothing outside
      const bitmap = (base64: string) =>
        createImageBitmap(
          new Blob([
            Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0),
          ])
        );
      const ground = await bitmap(base);
      const scale = ground.width / area.width;
      const canvas = new OffscreenCanvas(ground.width, ground.height);
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("No canvas to draw the window on");
      }

      context.drawImage(ground, 0, 0);

      for (const view of views) {
        // oxlint-disable-next-line no-await-in-loop -- drawn in order, bottom first
        const layer = await bitmap(view.png);

        context.drawImage(
          layer,
          view.bounds.x * scale,
          view.bounds.y * scale,
          view.bounds.width * scale,
          view.bounds.height * scale
        );
      }

      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";

      for (const byte of bytes) {
        binary += String.fromCodePoint(byte);
      }

      return btoa(binary);
    },
    layers
  );

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(composed, "base64"));
};
