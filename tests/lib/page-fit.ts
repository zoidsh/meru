/// <reference lib="dom" />
// The repository compiles without the DOM library, and these helpers read the
// renderer's own layout back out of it.

import { expect, type Page } from "@playwright/test";
import type { MeruApp } from "./app";

/**
 * The minimum is read from the window, so the test follows whatever main sets.
 * The main window's unless `page` is another window's.
 */
export async function setMinimumWindowWidth(meru: MeruApp, page: Page = meru.renderer) {
  const pageFileName = new URL(page.url()).pathname.split("/").at(-1) ?? "";

  const contentWidth = await meru.app.evaluate(({ BrowserWindow }, fileName) => {
    const window = BrowserWindow.getAllWindows()
      .filter((window) => !window.webContents.isDestroyed())
      .find((candidate) => candidate.webContents.getURL().includes(fileName));

    if (!window) {
      throw new Error(`No window shows ${fileName}`);
    }

    const [minimumWidth = 0] = window.getMinimumSize();

    const [, height = 0] = window.getSize();

    window.setSize(minimumWidth, height);

    return window.getContentSize()[0];
  }, pageFileName);

  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(contentWidth);

  return contentWidth;
}

/**
 * One line per misfit, so an empty list is the page fitting. The scroll area
 * only scrolls down, so anything it holds beyond its width across is cut off.
 *
 * The page is the one whose title is showing. A page with a close button, as
 * the unified inbox has, is also held to the button fitting and covering
 * nothing; settings has none.
 */
export function readPageMisfits(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;

    const viewport = document
      .querySelector('[data-testid="settings-title"]')
      ?.closest('[data-slot="scroll-area-viewport"]');

    if (!viewport) {
      throw new Error("No page with a title is open");
    }

    const closeButton = viewport.querySelector('button[title^="Close "]');

    const closeLabel = Array.from(closeButton?.parentElement?.children ?? []).find(
      (element) => element.textContent?.trim() === "Esc",
    );

    if (closeButton && !closeLabel) {
      throw new Error("The close button has no key label");
    }

    const closeArea = closeButton?.parentElement?.parentElement;

    if (closeButton && !closeArea) {
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

    const closeElements = closeButton && closeLabel ? [closeButton, closeLabel] : [];

    for (const element of [...switches, ...closeElements]) {
      const box = element.getBoundingClientRect();

      if (box.left < visibleLeft - 1 || box.right > visibleRight + 1) {
        misfits.push(
          `"${describe(element)}" spans ${Math.round(box.left)}-${Math.round(box.right)}px, outside the ${Math.round(visibleLeft)}-${Math.round(visibleRight)}px shown`,
        );
      }
    }

    if (!closeArea) {
      return misfits;
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
