/// <reference lib="dom" />
// The repository compiles without the DOM library, and these cases read the
// renderer's own layout back out of it.

/*
 * Text that doesn't fit, in every shipped language and the pseudo-locale.
 *
 * German runs about a third longer than English and the pseudo-locale is padded
 * by 40%, so a badge, a button or a sidebar item sized around the English string
 * clips or truncates in them while English looks right. Only screenshots catch
 * that otherwise.
 *
 * Each case walks the titlebar, in every state of the trial badge, and every
 * settings page the sidebar lists, at the width the window opens at and at its
 * minimum width, and reports every visible run of text that a box clips:
 * - an ancestor with `overflow` hidden or clipped on an axis, which is also what
 *   `text-overflow: ellipsis` and line clamping need, when the text reaches past
 *   that ancestor's padding box on that axis by more than a pixel;
 * - never past a scroll container, by its role: on an axis whose `overflow` is
 *   `auto` or `scroll` the box is meant to hold more than it shows, as the
 *   settings page, the sidebar and the account row do, so the walk up stops
 *   there for that axis; nor past the document's root and body;
 * - never a visually hidden element, by its role: a clipping box of a pixel or
 *   less is a screen reader's label, clipped on purpose.
 *
 * Text hidden by `display`, `visibility` or zero opacity is not checked, which
 * is why the trial badge is hovered: its "Upgrade to Meru Pro" side shows only
 * then.
 */
import { PSEUDO_LOCALE, SHIPPED_CATALOG_TAGS } from "@meru/shared/i18n/tags";
import type { Config } from "@meru/shared/types";
import { expect, type Locator, test } from "@playwright/test";
import { type MeruApp, useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

type Overflow = {
  text: string;
  element: string;
  clippedBy: string;
  horizontal: number;
  vertical: number;
};

/** Every visible run of text a box clips, as the comment at the top defines it. */
function readOverflows(meru: MeruApp) {
  return meru.renderer.evaluate(async () => {
    await document.fonts.ready;

    // A badge fades between its sides, and a box measured mid-transition is
    // neither state.
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    );

    const describeElement = (element: Element) => {
      const parts: string[] = [];

      for (
        let current: Element | null = element;
        current && current !== document.body && parts.length < 4;
        current = current.parentElement
      ) {
        let part = current.tagName.toLowerCase();

        const testId = current.getAttribute("data-testid");

        if (testId) {
          part += `[data-testid="${testId}"]`;
        } else if (current.id) {
          part += `[id="${current.id}"]`;
        }

        for (const attribute of ["role", "data-slot", "aria-label", "title"]) {
          const value = current.getAttribute(attribute);

          if (value) {
            part += `[${attribute}="${value}"]`;
          }
        }

        parts.unshift(part);

        if (testId || current.id) {
          break;
        }
      }

      return parts.join(" > ");
    };

    const clips = (value: string) => value === "hidden" || value === "clip";

    const scrolls = (value: string) => value === "auto" || value === "scroll";

    const overflows: Overflow[] = [];

    const range = document.createRange();

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();

      const parent = node.parentElement;

      if (
        !text ||
        !parent ||
        !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      ) {
        continue;
      }

      range.selectNodeContents(node);

      const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );

      if (rects.length === 0) {
        continue;
      }

      const textBox = {
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };

      let isCheckingX = true;

      let isCheckingY = true;

      for (
        let ancestor: Element | null = parent;
        ancestor &&
        ancestor !== document.body &&
        ancestor !== document.documentElement &&
        (isCheckingX || isCheckingY);
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);

        const clipsX = isCheckingX && clips(style.overflowX);

        const clipsY = isCheckingY && clips(style.overflowY);

        isCheckingX &&= !scrolls(style.overflowX);

        isCheckingY &&= !scrolls(style.overflowY);

        if (!clipsX && !clipsY) {
          continue;
        }

        const box = ancestor.getBoundingClientRect();

        if (box.width <= 1 || box.height <= 1) {
          break;
        }

        const paddingLeft = box.left + ancestor.clientLeft;

        const paddingTop = box.top + ancestor.clientTop;

        const horizontal = clipsX
          ? Math.max(
              paddingLeft - textBox.left,
              textBox.right - (paddingLeft + ancestor.clientWidth),
            )
          : 0;

        const vertical = clipsY
          ? Math.max(
              paddingTop - textBox.top,
              textBox.bottom - (paddingTop + ancestor.clientHeight),
            )
          : 0;

        if (horizontal > 1 || vertical > 1) {
          overflows.push({
            text,
            element: describeElement(parent),
            clippedBy: describeElement(ancestor),
            horizontal: Math.round(Math.max(horizontal, 0)),
            vertical: Math.round(Math.max(vertical, 0)),
          });

          break;
        }
      }
    }

    return overflows;
  });
}

function formatOverflow(where: string, overflow: Overflow) {
  const by = [
    overflow.horizontal > 1 ? `${overflow.horizontal}px across` : "",
    overflow.vertical > 1 ? `${overflow.vertical}px down` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return `${where}: "${overflow.text}" in ${overflow.element}, clipped ${by} by ${overflow.clippedBy}`;
}

/** The trial states the titlebar badge has a string for. */
const TRIAL_STATES = [
  { daysLeft: 7, expired: false },
  { daysLeft: 1, expired: false },
  { daysLeft: 0.5, expired: false },
  { daysLeft: 0, expired: true },
];

/*
 * Pushed the way main pushes a change found by its periodic check, which is
 * what draws the badge without a trial the API would have to grant.
 */
function setTrialState(meru: MeruApp, state: (typeof TRIAL_STATES)[number]) {
  return meru.app.evaluate(({ BrowserWindow }, trial) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes("main.html"),
    );

    window?.webContents.send("trial.changed", trial);
  }, state);
}

/**
 * Sets the window's width, the minimum one when none is given, and waits for
 * the renderer to have laid out at it.
 */
async function setWindowWidth(meru: MeruApp, width?: number) {
  const contentWidth = await meru.app.evaluate(({ BrowserWindow }, requestedWidth) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes("main.html"),
    );

    if (!window) {
      throw new Error("The main window is not open");
    }

    const [minimumWidth = 0] = window.getMinimumSize();

    const [, height = 0] = window.getSize();

    window.setSize(requestedWidth ?? minimumWidth, height);

    return window.getContentSize()[0];
  }, width);

  await expect.poll(() => meru.renderer.evaluate(() => window.innerWidth)).toBe(contentWidth);

  return contentWidth;
}

/*
 * Opened by its accelerator, which is the one thing about the Settings item
 * that is the same in every language.
 */
async function openSettings(meru: MeruApp) {
  const hasOpened = await meru.app.evaluate(({ Menu }) => {
    const find = (menuItems: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const menuItem of menuItems) {
        if (menuItem.accelerator === "CommandOrControl+,") {
          return menuItem;
        }

        const found = menuItem.submenu ? find(menuItem.submenu.items) : undefined;

        if (found) {
          return found;
        }
      }

      return undefined;
    };

    const menuItem = find(Menu.getApplicationMenu()?.items ?? []);

    // The next tick, for the reason `runMenuCommand` gives.
    if (menuItem) {
      setImmediate(() => {
        menuItem.click();
      });
    }

    return Boolean(menuItem);
  });

  expect(hasOpened).toBe(true);

  const navigation = meru.renderer.getByTestId("settings-nav");

  await expect(navigation).toBeVisible();

  return navigation;
}

/**
 * The pages the sidebar lists, in whatever language it lists them. Guarded on a
 * count rather than on names, so a selector that stopped matching fails here
 * instead of every case passing having checked nothing.
 */
async function readSettingsPageLabels(navigation: Locator) {
  const labels = await navigation.getByRole("button").allInnerTexts();

  expect(labels.length).toBeGreaterThanOrEqual(5);

  return labels;
}

const LANGUAGES: { tag: string; seedConfig: Partial<Config>; env: Record<string, string> }[] = [
  ...SHIPPED_CATALOG_TAGS.map((tag) => ({ tag, seedConfig: { "app.language": tag }, env: {} })),
  { tag: PSEUDO_LOCALE, seedConfig: {}, env: { MERU_PSEUDO_LOCALE: "1" } },
];

const WIDTHS = [
  { name: "the width the window opens at", isMinimum: false },
  { name: "the window's minimum width", isMinimum: true },
];

for (const language of LANGUAGES) {
  test.describe(language.tag, () => {
    const meru = useApp(language.seedConfig, { env: language.env });

    for (const width of WIDTHS) {
      test(`all text fits at ${width.name}`, async () => {
        await expect
          .poll(() => meru.renderer.evaluate(() => document.documentElement.lang))
          .toBe(language.tag);

        const windowWidth = width.isMinimum
          ? await setWindowWidth(meru)
          : await meru.renderer.evaluate(() => window.innerWidth);

        const findings: string[] = [];

        const check = async (where: string) => {
          for (const overflow of await readOverflows(meru)) {
            findings.push(formatOverflow(`${language.tag} ${windowWidth}px ${where}`, overflow));
          }
        };

        const trialBadge = meru.renderer.locator('a[href$="#pricing"]');

        for (const state of TRIAL_STATES) {
          await setTrialState(meru, state);

          await expect(trialBadge).toBeVisible();

          const where = `titlebar, trial ${JSON.stringify(state)}`;

          await check(where);

          await trialBadge.hover();

          await check(`${where}, hovered`);

          await meru.renderer.mouse.move(0, 0);
        }

        const navigation = await openSettings(meru);

        for (const label of await readSettingsPageLabels(navigation)) {
          await openSettingsPage(meru, navigation, label);

          await check(`settings "${label}"`);
        }

        expect(findings, "text clipped by its box").toEqual([]);
      });
    }
  });
}
