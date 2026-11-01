/// <reference lib="dom" />
// The repository compiles without the DOM library, and these cases read the
// renderer's own layout back out of it.

/*
 * Text that doesn't fit, in every shipped translation and the pseudo-locale.
 *
 * German runs about a third longer than English and the pseudo-locale is padded
 * by 40%, so a badge, a button or a sidebar item sized around the English string
 * clips or truncates in them while English looks right. Only screenshots catch
 * that otherwise. English itself has no case: the pseudo-locale is English
 * padded wider in every message, so a layout that fits it fits English.
 *
 * Each case walks the titlebar, in every state of the trial badge, and every
 * settings page the sidebar lists, at the width the window opens at and at its
 * minimum width, and reports every visible run of text that a box clips:
 * - an ancestor with `overflow` hidden or clipped on an axis, which is also what
 *   `text-overflow: ellipsis` and line clamping need, when the text reaches past
 *   that ancestor's padding box on that axis by more than a pixel;
 * - a scroll container on an axis it is not meant to scroll, which cuts text
 *   off as surely as `hidden` does: a Base UI scroll area scrolls only the axes
 *   it has a scrollbar for, vertical unless it was given a horizontal one;
 * - never past a scroll container on an axis it is meant to scroll, decided by
 *   its role as `readScrollAxes` says, as the settings page and sidebar do
 *   downwards and the account row sideways, so the walk up stops there for that
 *   axis;
 * - the window's own edges, for text no box cut off, on every axis nothing
 *   scrolls;
 * - never a visually hidden element, by its role: a clipping box of a pixel or
 *   less is a screen reader's label, clipped on purpose;
 * - never text inside an element marked `data-truncated`, a value the
 *   interface cuts short on purpose and offers whole another way, such as the
 *   Device ID beside its copy button.
 *
 * Text hidden by `display`, `visibility` or zero opacity is not checked, which
 * is why the trial badge is hovered: its "Upgrade to Meru Pro" side shows only
 * then.
 *
 * The titlebar is also checked for running out of room, which its badge and
 * controls show by colliding rather than clipping; `readTitlebarCollisions`
 * says how. A sortable row, such as an account's, runs out of room by pushing
 * its actions under its drag handle; `readSortableRowBreaks` says how.
 */
import { PSEUDO_LOCALE, SHIPPED_CATALOG_TAGS } from "@meru/shared/i18n/tags";
import type { Config } from "@meru/shared/types";
import { expect, type Locator, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type MeruApp, useApp } from "./lib/app";
import { setMinimumWindowWidth } from "./lib/page-fit";
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

    const scrolls = (value: string) => value === "auto" || value === "scroll";

    /*
     * The axes a scroll container is meant to scroll, by its role rather than by
     * its computed `overflow`. A Base UI viewport computes as scrolling both ways
     * but offers a scrollbar for each axis it scrolls, and only a vertical one
     * unless a horizontal one is added, so text pushed past its right edge is
     * cut off rather than scrolled to. Anything else scrolls the axes its own
     * `overflow` names, as the titlebar's account row does sideways.
     */
    const readScrollAxes = (element: Element, style: CSSStyleDeclaration) => {
      if (element.matches('[data-slot="scroll-area-viewport"]')) {
        return {
          x: Boolean(
            element.parentElement?.querySelector(
              ':scope > [data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
            ),
          ),
          y: true,
        };
      }

      return { x: scrolls(style.overflowX), y: scrolls(style.overflowY) };
    };

    const overflows: Overflow[] = [];

    const range = document.createRange();

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();

      const parent = node.parentElement;

      if (
        !text ||
        !parent ||
        parent.closest("[data-truncated]") ||
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

      /** How far the text reaches past a box on each axis still being checked. */
      const measure = (
        box: { left: number; top: number; width: number; height: number },
        axes: { x: boolean; y: boolean },
      ) => ({
        horizontal: axes.x
          ? Math.max(box.left - textBox.left, textBox.right - (box.left + box.width))
          : 0,
        vertical: axes.y
          ? Math.max(box.top - textBox.top, textBox.bottom - (box.top + box.height))
          : 0,
      });

      const report = (clippedBy: string, { horizontal, vertical }: ReturnType<typeof measure>) => {
        overflows.push({
          text,
          element: describeElement(parent),
          clippedBy,
          horizontal: Math.round(Math.max(horizontal, 0)),
          vertical: Math.round(Math.max(vertical, 0)),
        });
      };

      let isCheckingX = true;

      let isCheckingY = true;

      let isReported = false;

      for (
        let ancestor: Element | null = parent;
        ancestor &&
        ancestor !== document.body &&
        ancestor !== document.documentElement &&
        (isCheckingX || isCheckingY);
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);

        const scrollAxes = readScrollAxes(ancestor, style);

        isCheckingX &&= !scrollAxes.x;

        isCheckingY &&= !scrollAxes.y;

        // Whatever does not show its overflow cuts it off: `hidden` and `clip`,
        // and a scroll container on an axis it is not meant to scroll.
        const clipsX = isCheckingX && style.overflowX !== "visible";

        const clipsY = isCheckingY && style.overflowY !== "visible";

        if (!clipsX && !clipsY) {
          continue;
        }

        const box = ancestor.getBoundingClientRect();

        if (box.width <= 1 || box.height <= 1) {
          isReported = true;

          break;
        }

        const reach = measure(
          {
            left: box.left + ancestor.clientLeft,
            top: box.top + ancestor.clientTop,
            width: ancestor.clientWidth,
            height: ancestor.clientHeight,
          },
          { x: clipsX, y: clipsY },
        );

        if (reach.horizontal > 1 || reach.vertical > 1) {
          report(describeElement(ancestor), reach);

          isReported = true;

          break;
        }
      }

      // The window cuts off whatever no box did, on the axes nothing scrolls.
      if (!isReported && (isCheckingX || isCheckingY)) {
        const reach = measure(
          { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight },
          { x: isCheckingX, y: isCheckingY },
        );

        if (reach.horizontal > 1 || reach.vertical > 1) {
          report("the window", reach);
        }
      }
    }

    return overflows;
  });
}

/**
 * What a titlebar that has run out of room does instead of clipping: its
 * controls and labels land on top of each other, or its row runs past its
 * edges. A badge that only grows is neither.
 *
 * The items are the outermost visible controls and runs of text, so a button
 * and its own label are one item. Whatever sits inside a scroll container is
 * left out, by its role: the account row is made to slide under the controls
 * pinned over its right end.
 */
function readTitlebarCollisions(meru: MeruApp) {
  return meru.renderer.evaluate(() => {
    // The titlebar is the drag region the trial badge sits in.
    const titlebar = document.querySelector('a[href$="#pricing"]')?.closest(".draggable");

    if (!titlebar) {
      throw new Error("The titlebar is not showing the trial badge");
    }

    const titlebarBox = titlebar.getBoundingClientRect();

    const isInScrollContainer = (element: Element) => {
      for (
        let ancestor = element.parentElement;
        ancestor && ancestor !== titlebar;
        ancestor = ancestor.parentElement
      ) {
        const { overflowX } = getComputedStyle(ancestor);

        if (overflowX === "auto" || overflowX === "scroll") {
          return true;
        }
      }

      return false;
    };

    const hasOwnText = (element: Element) =>
      Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );

    const candidates = Array.from(titlebar.querySelectorAll("*")).filter(
      (element) =>
        (element.matches('button, a, input, [role="button"], [data-slot="badge"]') ||
          hasOwnText(element)) &&
        element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
        !isInScrollContainer(element),
    );

    const items = candidates.filter(
      (element) => !candidates.some((other) => other !== element && other.contains(element)),
    );

    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()} "${(element.textContent?.trim() || element.getAttribute("title") || element.getAttribute("aria-label") || "").slice(0, 60)}"`;

    const boxes = items.map((element) => ({ element, box: element.getBoundingClientRect() }));

    const collisions: string[] = [];

    for (const { element, box } of boxes) {
      const outside = Math.max(titlebarBox.left - box.left, box.right - titlebarBox.right);

      if (outside > 1) {
        collisions.push(`${describe(element)} runs ${Math.round(outside)}px past the titlebar`);
      }
    }

    for (const [index, { element, box }] of boxes.entries()) {
      for (const { element: other, box: otherBox } of boxes.slice(index + 1)) {
        const across = Math.min(box.right, otherBox.right) - Math.max(box.left, otherBox.left);

        const down = Math.min(box.bottom, otherBox.bottom) - Math.max(box.top, otherBox.top);

        if (across > 1 && down > 1) {
          collisions.push(
            `${describe(element)} overlaps ${describe(other)} by ${Math.round(across)}px`,
          );
        }
      }
    }

    const row = titlebar.firstElementChild;

    if (row && row.scrollWidth > row.clientWidth + 1) {
      collisions.push(`the titlebar row overflows by ${row.scrollWidth - row.clientWidth}px`);
    }

    return collisions;
  });
}

/*
 * A sortable row, such as an account on the Accounts page, keeps its drag
 * handle, its label and its actions on one line, however long its badges are,
 * and its title ends before its actions start, however long its label.
 * The row is a wrapping flex container, so content wider than what is left of
 * the line used to push the actions onto a line of their own, under the handle.
 * The first line runs from the top of the handle or the content, whichever is
 * higher, to the bottom of whichever is lower.
 */
function readSortableRowBreaks(meru: MeruApp) {
  return meru.renderer.evaluate(() => {
    const breaks: string[] = [];

    for (const row of document.querySelectorAll('[data-slot="item"]')) {
      const handle = row.querySelector(":scope > .cursor-grab");

      const content = row.querySelector(':scope > [data-slot="item-content"]');

      const action = row.querySelector(':scope > [data-slot="item-actions"] button');

      if (!handle || !content || !action) {
        continue;
      }

      const handleBox = handle.getBoundingClientRect();

      const contentBox = content.getBoundingClientRect();

      const actionBox = action.getBoundingClientRect();

      const lineTop = Math.min(handleBox.top, contentBox.top);

      const lineBottom = Math.max(handleBox.bottom, contentBox.bottom);

      const label = (content.textContent ?? "").trim().slice(0, 60);

      if (
        actionBox.top < lineTop - 0.5 ||
        actionBox.bottom > lineBottom + 0.5 ||
        actionBox.left < contentBox.right - 0.5
      ) {
        breaks.push(
          `row "${label}": its first action sits at ${Math.round(actionBox.left)},${Math.round(actionBox.top)}, off the line its handle and content share (${Math.round(lineTop)}–${Math.round(lineBottom)}, content ending at x ${Math.round(contentBox.right)})`,
        );
      }

      // The title's text rather than its box: a word with nowhere to break runs past a box that stays put.
      const title = content.querySelector('[data-slot="item-title"]');

      if (title) {
        const range = document.createRange();

        range.selectNodeContents(title);

        const textRight = Math.max(...Array.from(range.getClientRects(), (rect) => rect.right));

        if (textRight > actionBox.left + 0.5) {
          breaks.push(
            `row "${label}": its title runs to x ${Math.round(textRight)}, past its first action at x ${Math.round(actionBox.left)}`,
          );
        }
      }
    }

    return breaks;
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
 * The pages the sidebar lists, in whatever language it lists them. Guarded on a
 * count rather than on names, so a selector that stopped matching fails here
 * instead of every case passing having checked nothing.
 */
async function readSettingsPageLabels(navigation: Locator) {
  const labels = await navigation.getByRole("button").allInnerTexts();

  expect(labels.length).toBeGreaterThanOrEqual(5);

  return labels;
}

/*
 * An account labelled with an address that has nowhere to break, which a row
 * has to wrap inside its own column rather than run under its actions.
 */
const ACCOUNTS = [
  seedAccount({
    id: "account-1",
    label:
      "averyveryverylongemailaddresswithoutanyspaces.first.last@example-company-domain-name.com",
  }),
];

const LANGUAGES: { tag: string; seedConfig: Partial<Config>; env: Record<string, string> }[] = [
  ...SHIPPED_CATALOG_TAGS.filter((tag) => tag !== "en").map((tag) => ({
    tag,
    seedConfig: { "app.language": tag, accounts: ACCOUNTS },
    env: {},
  })),
  { tag: PSEUDO_LOCALE, seedConfig: { accounts: ACCOUNTS }, env: { MERU_PSEUDO_LOCALE: "1" } },
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
          ? await setMinimumWindowWidth(meru)
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

          for (const collision of await readTitlebarCollisions(meru)) {
            findings.push(`${language.tag} ${windowWidth}px ${where}: ${collision}`);
          }

          await trialBadge.hover();

          await check(`${where}, hovered`);

          await meru.renderer.mouse.move(0, 0);
        }

        const navigation = await meru.openSettings();

        for (const label of await readSettingsPageLabels(navigation)) {
          await openSettingsPage(meru, navigation, label);

          await check(`settings "${label}"`);

          for (const rowBreak of await readSortableRowBreaks(meru)) {
            findings.push(`${language.tag} ${windowWidth}px settings "${label}": ${rowBreak}`);
          }
        }

        expect(findings, "text clipped by its box").toEqual([]);
      });
    }
  });
}
