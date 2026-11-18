import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

interface Layers {
  area: { width: number; height: number };
  /** The window's own page, drawn first, where it has one. */
  ground?: string;
  views: { png: string; bounds: Electron.Rectangle }[];
}

/**
 * Draws the layers in order, bottom first, at the scale of the first one,
 * by the shell's renderer on a canvas no one sees.
 */
const compose = async (shell: Page, layers: Layers, file: string) => {
  const composed = await shell.evaluate(async ({ area, ground, views }) => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the shell, which sees nothing outside
    const bitmap = (base64: string) =>
      createImageBitmap(
        new Blob([Uint8Array.from(atob(base64), (c) => c.codePointAt(0) ?? 0)])
      );
    const base = ground === undefined ? undefined : await bitmap(ground);
    const drawn = await Promise.all(
      views.map(async (view) => ({
        layer: await bitmap(view.png),
        bounds: view.bounds,
      }))
    );
    const [first] = drawn;
    const scale = base
      ? base.width / area.width
      : (first?.layer.width ?? area.width) /
        (first?.bounds.width ?? area.width);
    const canvas = new OffscreenCanvas(
      Math.round(area.width * scale),
      Math.round(area.height * scale)
    );
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No canvas to draw the window on");
    }

    if (base) {
      context.drawImage(base, 0, 0);
    }

    for (const { layer, bounds } of drawn) {
      context.drawImage(
        layer,
        bounds.x * scale,
        bounds.y * scale,
        bounds.width * scale,
        bounds.height * scale
      );
    }

    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";

    for (const byte of bytes) {
      binary += String.fromCodePoint(byte);
    }

    return btoa(binary);
  }, layers);

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(composed, "base64"));
};

/**
 * The shell window as a person sees it, never the display: the window's
 * `capturePage()` holds the shell's page alone, so each view shown over it,
 * a tab's page or the overlay's, is captured too and drawn where it sits.
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
      ground: await png(window.webContents),
      views: await Promise.all(
        views.map(async (view) => ({
          png: await png(view.webContents),
          bounds: view.getBounds(),
        }))
      ),
    };
  });

  await compose(shell, layers, file);
};

/**
 * A tab's own window as a person sees it, from its views alone, the shell's
 * titlebar document under the tab's page; it has no page of its own, and
 * the macOS traffic lights, drawn by the system, are not in it.
 */
export const shootOwnWindow = async (
  app: ElectronApplication,
  shell: Page,
  file: string
) => {
  const layers = await app.evaluate(async ({ BaseWindow, BrowserWindow }) => {
    const window = BaseWindow.getAllWindows().find(
      (candidate) => !(candidate instanceof BrowserWindow)
    );

    if (!window) {
      throw new Error("The app has no tab in a window of its own");
    }

    const views = window.contentView.children
      .map((view) => view as Electron.WebContentsView)
      .filter((view) => view.getVisible() && view.webContents);

    return {
      area: window.contentView.getBounds(),
      views: await Promise.all(
        views.map(async (view) => {
          const image = await view.webContents.capturePage();

          return {
            png: image.toPNG().toString("base64"),
            bounds: view.getBounds(),
          };
        })
      ),
    };
  });

  await compose(shell, layers, file);
};
