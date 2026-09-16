/// <reference lib="dom" />
// The repository compiles without the DOM library, and these cases read the
// renderer's own layout back out of it.

/*
 * More accounts than the titlebar has room for.
 *
 * The account buttons cannot shrink, so a row of them used to grow the renderer
 * document rather than stop at the window's edge. That is worse than it sounds:
 * the document's scrollbars sit at the bottom and right of the window, under the
 * Gmail view that paints over them, so nothing is visible to drag — and wheeling
 * over the titlebar slid the titlebar and the tab strip sideways beneath views
 * that stayed where they were. The right-hand controls went off-screen with them.
 *
 * So the claims are about the window rather than about the row: the document
 * never overflows, and the controls at the right edge are still in it. What the
 * row does instead — scroll, bring the selected account into view, and offer an
 * arrow at each end — is the rest.
 *
 * Pro, because the free version runs one account and there would be no row.
 * Sixteen of them at 1000x700 is comfortably more than fits; the point is the
 * overflow, not the exact number.
 *
 * Two launches rather than one, because `useApp` seeds every test in the group
 * it is called in and which account the app comes up on is the difference
 * between the two groups: a row that has to be scrolled before it is right and a
 * row that is right where it starts.
 */
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type MeruApp, useProApp } from "./lib/app";

const ACCOUNT_LABELS = [
  "Personal",
  "Work",
  "Studio",
  "Freelance",
  "Side project",
  "Family",
  "Old work",
  "Newsletters",
  "Support",
  "Billing",
  "Club",
  "School",
  "Volunteer",
  "Archive",
  "Sales",
  "Operations",
];

/** The account at the far end of the row, which nothing can reach without scrolling. */
const LAST_ACCOUNT_ID = `account-${ACCOUNT_LABELS.length}`;

const LAST_ACCOUNT_LABEL = ACCOUNT_LABELS[ACCOUNT_LABELS.length - 1] as string;

/** The button of the account the row has scrolled to, wherever the row is right. */
const IN_VIEW = { isInsideRow: true, isClearOfRightControls: true };

function seedConfig(selectedIndex: number) {
  return {
    accounts: ACCOUNT_LABELS.map((label, index) =>
      seedAccount({ id: `account-${index + 1}`, label, selected: index === selectedIndex }),
    ),
    "window.lastState": {
      bounds: { width: 1000, height: 700, x: undefined, y: undefined },
      fullscreen: false,
      maximized: false,
    },
  };
}

/**
 * How far the renderer document reaches past the window, which is what a
 * scrollbar would be drawn for. Anything above zero is the bug.
 */
function readDocumentOverflow(app: MeruApp) {
  return app.renderer.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
}

async function expectNoDocumentOverflow(app: MeruApp, route: string) {
  await expect
    .poll(() => readDocumentOverflow(app), { message: `document overflow on ${route}` })
    .toEqual({ horizontal: 0, vertical: 0 });
}

/**
 * Where one account's button sits relative to the row that scrolls it and to the
 * controls pinned over the row's right end.
 *
 * Both comparisons matter. The row runs the full width of the titlebar and the
 * controls sit on top of it, so a button can be inside the row and still be
 * behind them.
 */
function readAccountButtonPlacement(app: MeruApp, accountId: string) {
  return app.renderer.evaluate((id) => {
    const button = document.querySelector(`[data-account-id="${id}"]`);

    if (!button) {
      throw new Error(`No titlebar button for account ${id}`);
    }

    const row = button.parentElement;

    if (!row) {
      throw new Error(`The button for account ${id} is not in a row`);
    }

    // The controls are pinned over the row by being positioned, so the nearest
    // positioned ancestor of one of them is the box the row has to stay clear of.
    let rightControls =
      document.querySelector('[title="Show recent download history"]')?.parentElement ?? null;

    while (rightControls && getComputedStyle(rightControls).position !== "absolute") {
      rightControls = rightControls.parentElement;
    }

    if (!rightControls) {
      throw new Error("The titlebar is not showing its right-hand controls");
    }

    const buttonRect = button.getBoundingClientRect();

    const rowRect = row.getBoundingClientRect();

    return {
      isInsideRow: buttonRect.left >= rowRect.left - 1 && buttonRect.right <= rowRect.right + 1,
      isClearOfRightControls: buttonRect.right <= rightControls.getBoundingClientRect().left + 1,
    };
  }, accountId);
}

function readRowScrollLeft(app: MeruApp) {
  return app.renderer.evaluate(() => {
    const button = document.querySelector("[data-account-id]");

    if (!button?.parentElement) {
      throw new Error("The titlebar is not showing an account row");
    }

    return button.parentElement.scrollLeft;
  });
}

/** Whether a titlebar control is still inside the window rather than pushed past its edge. */
function readControlIsOnScreen(app: MeruApp, title: string) {
  return app.renderer.evaluate((controlTitle) => {
    const control = document.querySelector(`[title="${controlTitle}"]`);

    if (!control) {
      throw new Error(`The titlebar is not showing ${controlTitle}`);
    }

    const { left, right } = control.getBoundingClientRect();

    return left >= 0 && right <= window.innerWidth;
  }, title);
}

async function readSelectedAccountId(app: MeruApp) {
  return (await app.readConfig()).accounts?.find((account) => account.selected)?.id;
}

/** One of the row's scroll arrows, which is in the page for as long as the row overflows. */
function readScrollArrow(app: MeruApp, end: "left" | "right") {
  return app.renderer.getByTitle(`Scroll accounts ${end}`);
}

/**
 * How far an arrow has faded in, read off the wrapper the opacity is set on
 * rather than off the button inside it.
 */
function readScrollArrowOpacity(app: MeruApp, end: "left" | "right") {
  return app.renderer.evaluate((arrowEnd) => {
    const arrow = document.querySelector(`[title="Scroll accounts ${arrowEnd}"]`);

    if (!arrow?.parentElement) {
      throw new Error(`The titlebar is not showing an arrow to scroll the accounts ${arrowEnd}`);
    }

    return Number(getComputedStyle(arrow.parentElement).opacity);
  }, end);
}

/*
 * An arrow with nothing left to reach stays in the page and fades out, so
 * Playwright still counts it as visible. What says it is gone is that it cannot
 * be used and has faded to nothing — polled either way, because the fade takes a
 * moment to play.
 */
async function expectScrollArrowOffered(app: MeruApp, end: "left" | "right") {
  await expect(readScrollArrow(app, end)).toBeEnabled();

  await expect.poll(() => readScrollArrowOpacity(app, end)).toBe(1);
}

async function expectScrollArrowFadedOut(app: MeruApp, end: "left" | "right") {
  await expect(readScrollArrow(app, end)).toBeDisabled();

  await expect.poll(() => readScrollArrowOpacity(app, end)).toBe(0);
}

/**
 * The seam between the right arrow and the controls it is held off, which is
 * what the row's buttons would slide through on their way past.
 *
 * The arrow is held off by however much of the row the controls cover, and that
 * is not how wide they are: they are pinned to the titlebar's padding box while
 * the row ends at its content box.
 */
function readRightArrowSeam(app: MeruApp) {
  return app.renderer.evaluate(() => {
    const arrow = document.querySelector('[title="Scroll accounts right"]');

    if (!arrow) {
      throw new Error("The titlebar is not offering to scroll the accounts right");
    }

    let rightControls =
      document.querySelector('[title="Show recent download history"]')?.parentElement ?? null;

    while (rightControls && getComputedStyle(rightControls).position !== "absolute") {
      rightControls = rightControls.parentElement;
    }

    if (!rightControls) {
      throw new Error("The titlebar is not showing its right-hand controls");
    }

    return rightControls.getBoundingClientRect().left - arrow.getBoundingClientRect().right;
  });
}

/** How long the row has to sit on one offset before it counts as having arrived. */
const SETTLED_FRAMES = 10;

/** The most frames the row is given to arrive at all, however slow the display. */
const MAXIMUM_FRAMES = 600;

/**
 * Every scroll offset the row passes through on its way to its end, sampled in
 * the page because what is being watched for happens within a frame.
 *
 * Sampled until the offset has sat still rather than for a set number of frames.
 * A frame is however long the display makes it, and a window that ran out before
 * the row arrived would be a case that watched none of the arrival and passed.
 */
function recordScrollOffsetsToEnd(app: MeruApp) {
  return app.renderer.evaluate(
    async ({ settledFrames, maximumFrames }) => {
      const row = document.querySelector("[data-account-id]")?.parentElement;

      if (!row) {
        throw new Error("The titlebar is not showing an account row");
      }

      row.scrollBy({ left: row.scrollWidth });

      const offsets: number[] = [];

      let framesStill = 0;

      while (framesStill < settledFrames && offsets.length < maximumFrames) {
        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
        });

        const offset = row.scrollLeft;

        framesStill = offset === offsets.at(-1) ? framesStill + 1 : 0;

        offsets.push(offset);
      }

      return { offsets, hasSettled: framesStill >= settledFrames };
    },
    { settledFrames: SETTLED_FRAMES, maximumFrames: MAXIMUM_FRAMES },
  );
}

test.describe("coming up on the first account", () => {
  const meru = useProApp(seedConfig(0));

  test("the window never grows a scrollbar for the row to overflow into", async () => {
    await expectNoDocumentOverflow(meru, "/");

    // The other route the titlebar draws the account row on, and the one whose
    // page is renderer HTML all the way down rather than a view painted over it.
    expect(await meru.runMenuCommand("Unified Inbox")).toBe(true);

    await expect.poll(() => new URL(meru.renderer.url()).hash).toBe("#/unified-inbox");

    await expectNoDocumentOverflow(meru, "/unified-inbox");
  });

  test("the controls at the right edge stay in the window", async () => {
    await expect.poll(() => readControlIsOnScreen(meru, "Show recent download history")).toBe(true);

    expect(await readControlIsOnScreen(meru, "Turn Do Not Disturb on")).toBe(true);
  });

  test("selecting an account out of reach scrolls it into view", async () => {
    const initialPlacement = await readAccountButtonPlacement(meru, LAST_ACCOUNT_ID);

    // The premise. With this account already on screen the rest of the test would
    // pass against a row that never scrolled.
    expect(initialPlacement.isInsideRow).toBe(false);

    /*
     * Chosen through the application menu rather than by clicking the button,
     * which is the case worth covering: a click could scroll the row from its own
     * handler, while the menu, the accelerators, Select Next Account and the mouse
     * buttons all select an account with the titlebar hearing nothing but the new
     * selection.
     */
    expect(await meru.runMenuCommand(LAST_ACCOUNT_LABEL)).toBe(true);

    await expect.poll(() => readSelectedAccountId(meru)).toBe(LAST_ACCOUNT_ID);

    await expect.poll(() => readAccountButtonPlacement(meru, LAST_ACCOUNT_ID)).toEqual(IN_VIEW);
  });

  test("an arrow appears at each end there is something to reach, and scrolls the row there", async () => {
    const scrollLeftButton = readScrollArrow(meru, "left");

    const scrollRightButton = readScrollArrow(meru, "right");

    // The row starts at the first account, so there is nothing to go back to and
    // no arrow offering to.
    await expectScrollArrowFadedOut(meru, "left");

    await expectScrollArrowOffered(meru, "right");

    // Flush against the controls it is held off, with nothing between the two
    // for the row to show through. Polled, because the arrow is placed from a
    // measurement the row takes of itself.
    await expect.poll(() => readRightArrowSeam(meru)).toBeLessThanOrEqual(1);

    expect(await readRightArrowSeam(meru)).toBeGreaterThanOrEqual(-1);

    await scrollRightButton.click();

    await expect.poll(() => readRowScrollLeft(meru)).toBeGreaterThan(0);

    await expectScrollArrowOffered(meru, "left");

    const scrolledTo = await readRowScrollLeft(meru);

    await scrollLeftButton.click();

    /*
     * Back toward the start rather than to a figure worked out here. A click
     * covers a screenful of the row less whatever is over that screenful, and what
     * is over it differs by end and by whether the row has reached one, so where a
     * click back lands is a function of the window's width. That it goes back is
     * the claim.
     */
    await expect.poll(() => readRowScrollLeft(meru)).toBeLessThan(scrolledTo);
  });

  test("reaching the end does not jolt the row sideways", async () => {
    /*
     * Wheeled first, and over a button rather than between two, for two reasons
     * at once: the row only stops owing the account it came up on a scroll into
     * view once someone drives it themselves, and the gaps between the buttons
     * used to be a drag region, which on macOS takes a wheel before the page
     * sees it.
     */
    await meru.renderer.getByRole("button", { name: ACCOUNT_LABELS[0] as string }).hover();

    await meru.renderer.mouse.wheel(0, 120);

    await expect.poll(() => readRowScrollLeft(meru)).toBeGreaterThan(0);

    const { offsets, hasSettled } = await recordScrollOffsetsToEnd(meru);

    expect(hasSettled, `the row was still moving after ${MAXIMUM_FRAMES} frames`).toBe(true);

    await expectScrollArrowFadedOut(meru, "right");

    /*
     * Never backwards, which is the whole claim. The arrow at the right end once
     * sat inside the controls it is now held off, so it took its width out of
     * them the moment it had nothing left to reach — and the row reserves the
     * width of those controls twice over, in the space after its last button and
     * in its scroll padding. Both shrank, the scroll offset was clamped to the
     * smaller maximum, and every button jumped sideways at the instant the row
     * arrived.
     */
    const stepsBack = offsets.filter(
      (offset, index) => index > 0 && offset < (offsets[index - 1] as number),
    );

    expect(stepsBack).toEqual([]);

    // The other half: it did reach the end, so an offset that never moved would
    // not read as this passing.
    expect(await readAccountButtonPlacement(meru, LAST_ACCOUNT_ID)).toEqual(IN_VIEW);
  });

  test("the arrows come back with the row after a trip through settings", async () => {
    const scrollRightButton = readScrollArrow(meru, "right");

    await expectScrollArrowOffered(meru, "right");

    await meru.openSettings();

    // Gone rather than faded out: settings takes the whole row with it.
    await expect(scrollRightButton).toHaveCount(0);

    await meru.renderer.getByRole("button", { name: "Close settings" }).click();

    await expect(meru.renderer.getByRole("button", { name: "Go back" })).toBeVisible();

    /*
     * A row laid out afresh works out what it can reach for itself, and has to
     * keep working it out: measured once, against a layout its buttons have not
     * finished settling into, it would read a row that fits and offer nothing to
     * scroll it with ever again.
     */
    await expectScrollArrowOffered(meru, "right");

    await scrollRightButton.click();

    await expectScrollArrowOffered(meru, "left");
  });
});

/*
 * The account the app comes up on is the one the row has the least warning
 * about: it is selected before the window exists, so the row has to be scrolled
 * by its own first layout rather than by anything happening.
 */
test.describe("coming up on the last account", () => {
  const meru = useProApp(seedConfig(ACCOUNT_LABELS.length - 1));

  test("its button is in view, and is still there once the row has settled", async () => {
    await expect.poll(() => readAccountButtonPlacement(meru, LAST_ACCOUNT_ID)).toEqual(IN_VIEW);

    /*
     * Read once rather than polled for, and that is the point of it. The row is
     * first laid out before the overlays it has to stay clear of have been
     * measured, before the pushed account list has added the unread badges and
     * attention icons that widen every button, and in a fallback font — and a
     * row scrolled once, against the first of those, ends up somewhere the
     * account is not. Polling above says it got there; this says it stayed,
     * across the reflow that the font arriving is the last of.
     */
    await meru.renderer.evaluate(async () => {
      await document.fonts.ready;
    });

    expect(await readAccountButtonPlacement(meru, LAST_ACCOUNT_ID)).toEqual(IN_VIEW);
  });
});
