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
    const scrollLeftButton = meru.renderer.getByRole("button", { name: "Scroll accounts left" });

    const scrollRightButton = meru.renderer.getByRole("button", { name: "Scroll accounts right" });

    // The row starts at the first account, so there is nothing to go back to and
    // no arrow offering to.
    await expect(scrollLeftButton).toHaveCount(0);

    await expect(scrollRightButton).toBeVisible();

    await scrollRightButton.click();

    await expect.poll(() => readRowScrollLeft(meru)).toBeGreaterThan(0);

    await expect(scrollLeftButton).toBeVisible();

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
