import type { Page } from "@playwright/test";

import { expect, findPage, test, writeState } from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";

/** Gmail pinned, then a split of Drive and Calendar first in the list, then two tabs. */
const seed = (userDataDir: string, standIn: StandIn) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: standIn.url,
            title: "",
            pinned: true,
          },
          { id: "d1", app: "drive", url: standIn.driveUrl, title: "" },
          { id: "c1", app: "calendar", url: standIn.calendarUrl, title: "" },
          // Never shown, so never loading Google's own pages.
          { id: "s", app: "sheets", url: standIn.driveUrl, title: "Budget" },
          { id: "l", app: "slides", url: standIn.driveUrl, title: "Pitch" },
        ],
        selectedTabId: "c1",
        splits: [
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "d1" },
                { size: 0.5, pane: "c1" },
              ],
            },
          },
        ],
      },
    ],
    selectedProfileId: "p",
  });

interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The sidebar as drawn: the box, its tabs, the list's items top to bottom
 * (the box as one), the pinned area's last tile, New tab, a tab outside the
 * box, and the scroller that clips the box.
 */
const measure = (shell: Page) =>
  shell.evaluate(() => {
    // oxlint-disable-next-line consistent-function-scoping -- runs in the page, which has only what this function holds
    const edges = (element: Element | null | undefined) => {
      const box = element?.getBoundingClientRect();

      return {
        left: box?.left ?? 0,
        right: box?.right ?? 0,
        top: box?.top ?? 0,
        bottom: box?.bottom ?? 0,
      };
    };
    const box = document.querySelector("[data-split-box]");
    const listed = document.querySelector('[data-tab-area="listed"]');
    const pinned = [
      ...document.querySelectorAll('[data-tab-area="pinned"] [data-tab-id]'),
    ];

    return {
      box: edges(box),
      inBox: [...(box?.querySelectorAll("[data-tab-id]") ?? [])].map(edges),
      items: [...(listed?.children ?? [])].map(edges),
      outside: edges(listed?.querySelector('[data-tab-id="s"]')),
      lastPinned: edges(pinned.at(-1)),
      newTab: edges(document.querySelector("[data-list-end] button")),
      clip: edges(box?.closest("[data-slot=scroll-area-viewport]")),
      // What a native scrollbar takes from each scroll area's width.
      nativeBars: [
        ...document.querySelectorAll<HTMLElement>(
          "[data-slot=scroll-area-viewport]"
        ),
      ].map((viewport) => viewport.offsetWidth - viewport.clientWidth),
    };
  });

/** The gaps between neighbours top to bottom, from the pinned area to New tab. */
const gaps = (drawn: Awaited<ReturnType<typeof measure>>) => {
  const stack: Edges[] = [drawn.lastPinned, ...drawn.items, drawn.newTab];

  return stack
    .slice(1)
    .map((each, index) => each.top - (stack[index]?.bottom ?? 0));
};

/** Rests the pointer on the box's last tab, as a person hovering it. */
const hoverLastInBox = async (shell: Page) => {
  await expect
    .poll(async () => {
      const { inBox } = await measure(shell);

      return inBox.length;
    })
    .toBe(2);

  const { inBox } = await measure(shell);
  const last = inBox.at(-1);

  await shell.mouse.move(
    ((last?.left ?? 0) + (last?.right ?? 0)) / 2,
    ((last?.top ?? 0) + (last?.bottom ?? 0)) / 2
  );
};

const expectBoxDrawn = async (shell: Page, gap: number) => {
  const drawn = await measure(shell);
  const [first] = drawn.inBox;
  const last = drawn.inBox.at(-1);

  // 4px of fill around the tabs on every side.
  expect({
    left: (first?.left ?? 0) - drawn.box.left,
    right: drawn.box.right - (first?.right ?? 0),
    top: (first?.top ?? 0) - drawn.box.top,
    bottom: drawn.box.bottom - (last?.bottom ?? 0),
  }).toStrictEqual({ left: 4, right: 4, top: 4, bottom: 4 });
  // Its tabs in the column of the tabs outside it, the stack's gap between.
  expect([first?.left, first?.right]).toStrictEqual([
    drawn.outside.left,
    drawn.outside.right,
  ]);
  expect((last?.top ?? 0) - (first?.bottom ?? 0)).toBe(gap);
  // The column plus 4px each side, none of it clipped.
  expect(drawn.box.right - drawn.box.left).toBe(
    drawn.outside.right - drawn.outside.left + 8
  );
  expect(drawn.clip.left).toBeLessThanOrEqual(drawn.box.left);
  expect(drawn.clip.right).toBeGreaterThanOrEqual(drawn.box.right);
  expect(drawn.clip.top).toBeLessThanOrEqual(drawn.box.top);
  expect(drawn.nativeBars).toStrictEqual(drawn.nativeBars.map(() => 0));
  // One gap between every two neighbours, the box's edges included.
  expect(gaps(drawn)).toStrictEqual(gaps(drawn).map(() => gap));
};

test("a split's box in the sidebar holds its tabs 4px in from each edge, in the column of the others, one stack gap from its neighbours and unclipped, narrow and wide", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const narrow = shell.getByRole("button", { name: "Narrow sidebar" });

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.driveUrl);

  if ((await narrow.count()) > 0) {
    await narrow.click();
  }

  await hoverLastInBox(shell);
  // The shell may still be drawing the new width.
  await expect(() => expectBoxDrawn(shell, 8)).toPass();

  await shell.getByRole("button", { name: "Widen sidebar" }).click();
  await expect(narrow).toHaveCount(1);
  await hoverLastInBox(shell);
  await expect(() => expectBoxDrawn(shell, 4)).toPass();
});
