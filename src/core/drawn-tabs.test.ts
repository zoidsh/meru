import { describe, expect, it } from "vitest";

import { drawnTabs, sidebarLayout } from "./drawn-tabs.ts";
import type { SidebarItem } from "./drawn-tabs.ts";
import { gmailTab, newProfile } from "./state.ts";
import type { Tab } from "./state.ts";

const tab = (id: string, pinned = false) => ({ id, pinned });

const names = (items: SidebarItem<{ id: string }>[]) =>
  items.map((item) =>
    item.kind === "box"
      ? `[${item.tabs.map(({ id }) => id).join(" ")}]`
      : item.tab.id
  );

const layout = (...boxes: string[][]) => {
  const { pinned, listed } = sidebarLayout(
    [
      tab("g", true),
      tab("p", true),
      tab("q", true),
      tab("a"),
      tab("b"),
      tab("c"),
      tab("n"),
    ],
    boxes
  );

  return [names(pinned), names(listed)];
};

describe(sidebarLayout, () => {
  it("puts the box in the list where its first tab stands, in its own order", () => {
    expect(layout(["n", "b"])).toStrictEqual([
      ["g", "p", "q"],
      ["a", "[n b]", "c"],
    ]);
  });

  it("puts each box in the list where its first tab stands, two side by side included", () => {
    expect([
      layout(["n", "b"], ["c", "a"]),
      layout(["b", "a"], ["n", "c"]),
    ]).toStrictEqual([
      [
        ["g", "p", "q"],
        ["[c a]", "[n b]"],
      ],
      [
        ["g", "p", "q"],
        ["[b a]", "[n c]"],
      ],
    ]);
  });

  it("puts every box holding a pinned tab first in the pinned area, in the splits' order", () => {
    expect([
      layout(["q", "c"], ["p", "a"]),
      layout(["q", "c"], ["n", "a"]),
    ]).toStrictEqual([
      [
        ["[q c]", "[p a]", "g"],
        ["b", "n"],
      ],
      [
        ["[q c]", "g", "p"],
        ["[n a]", "b"],
      ],
    ]);
  });

  it("gives each drawn box's tabs in its own order, leaving out one not drawn", () => {
    const tabs = [tab("g", true), tab("a"), tab("b"), tab("c"), tab("d")];

    expect(
      sidebarLayout(tabs, [
        ["b", "a"],
        ["c", "gone"],
        ["d", "c"],
      ]).boxes.map((box) => box.map(({ id }) => id))
    ).toStrictEqual([
      ["b", "a"],
      ["d", "c"],
    ]);
  });

  it("draws no box for none, or for fewer than two of its tabs shown", () => {
    expect([layout(), layout(["a", "gone"])]).toStrictEqual([
      [
        ["g", "p", "q"],
        ["a", "b", "c", "n"],
      ],
      [
        ["g", "p", "q"],
        ["a", "b", "c", "n"],
      ],
    ]);
  });
});

const listedTab = (id: string, app = "calendar"): Tab => ({
  id,
  app,
  url: "",
  title: id,
});

describe(drawnTabs, () => {
  it("is the profile's shown tabs top to bottom as the sidebar draws them, a box in each area", () => {
    expect(
      drawnTabs({
        ...newProfile("p", "Default"),
        tabs: [
          gmailTab(),
          listedTab("a"),
          listedTab("b"),
          listedTab("x", "later"),
          listedTab("c"),
          listedTab("n", "drive"),
        ],
        splits: [
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "c" },
                { size: 0.5, pane: "gmail" },
              ],
            },
          },
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "a" },
                { size: 0.5, pane: "n" },
              ],
            },
          },
        ],
      }).map(({ id }) => id)
    ).toStrictEqual(["gmail", "c", "a", "n", "b"]);
  });
});
