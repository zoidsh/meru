/// <reference lib="dom" />
// The repository compiles without the DOM library, and these helpers read the
// renderer's own layout back out of it.

import { expect } from "@playwright/test";
import type { MeruApp } from "./app";

/** The minimum is read from the window, so the test follows whatever main sets. */
export async function setMinimumWindowWidth(meru: MeruApp) {
  const contentWidth = await meru.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes("main.html"),
    );

    if (!window) {
      throw new Error("The main window is not open");
    }

    const [minimumWidth = 0] = window.getMinimumSize();

    const [, height = 0] = window.getSize();

    window.setSize(minimumWidth, height);

    return window.getContentSize()[0];
  });

  await expect.poll(() => meru.renderer.evaluate(() => window.innerWidth)).toBe(contentWidth);

  return contentWidth;
}

/**
 * One line per misfit, so an empty list is the page fitting. The scroll area
 * only scrolls down, so anything it holds beyond its width across is cut off.
 */
export function readPageMisfits(meru: MeruApp) {
  return meru.renderer.evaluate(async () => {
    await document.fonts.ready;

    const closeButton = document.querySelector('button[title^="Close "]');

    const viewport = closeButton?.closest('[data-slot="scroll-area-viewport"]');

    if (!closeButton || !viewport) {
      throw new Error("No page with a close button is open");
    }

    const closeLabel = Array.from(closeButton.parentElement?.children ?? []).find(
      (element) => element.textContent?.trim() === "Esc",
    );

    if (!closeLabel) {
      throw new Error("The close button has no key label");
    }

    const closeArea = closeButton.parentElement?.parentElement;

    if (!closeArea) {
      throw new Error("The close button is not where the page places it");
    }

    const misfits: string[] = [];

    if (viewport.scrollWidth > viewport.clientWidth + 1) {
      misfits.push(
        `the page is ${viewport.scrollWidth}px wide in a scroll area showing ${viewport.clientWidth}px`,
      );
    }

    const viewportBox = viewport.getBoundingClientRect();

    const visibleLeft = Math.max(viewportBox.left + viewport.clientLeft, 0);

    const visibleRight = Math.min(
      viewportBox.left + viewport.clientLeft + viewport.clientWidth,
      window.innerWidth,
    );

    const describe = (element: Element) =>
      element.getAttribute("aria-labelledby") ??
      element.getAttribute("title") ??
      element.textContent?.trim().slice(0, 40) ??
      element.tagName.toLowerCase();

    const switches = Array.from(viewport.querySelectorAll('[data-slot="switch"]'));

    for (const element of [...switches, closeButton, closeLabel]) {
      const box = element.getBoundingClientRect();

      if (box.left < visibleLeft - 1 || box.right > visibleRight + 1) {
        misfits.push(
          `"${describe(element)}" spans ${Math.round(box.left)}-${Math.round(box.right)}px, outside the ${Math.round(visibleLeft)}-${Math.round(visibleRight)}px shown`,
        );
      }
    }

    const closeBox = closeArea.getBoundingClientRect();

    const intersects = (box: DOMRect) =>
      Math.min(box.right, closeBox.right) - Math.max(box.left, closeBox.left) > 0 &&
      Math.min(box.bottom, closeBox.bottom) - Math.max(box.top, closeBox.top) > 0;

    const range = document.createRange();

    const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || closeArea.contains(node)) {
        continue;
      }

      range.selectNodeContents(node);

      if (Array.from(range.getClientRects()).some(intersects)) {
        misfits.push(`the close button covers "${node.textContent.trim().slice(0, 40)}"`);
      }
    }

    for (const control of viewport.querySelectorAll(
      'button, input, [role="combobox"], [data-slot="switch"]',
    )) {
      if (!closeArea.contains(control) && intersects(control.getBoundingClientRect())) {
        misfits.push(`the close button covers "${describe(control)}"`);
      }
    }

    return misfits;
  });
}
