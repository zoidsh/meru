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

const layout = (box?: string[]) => {
  const { pinned, listed } = sidebarLayout(
    [tab("g", true), tab("p", true), tab("a"), tab("b"), tab("c"), tab("n")],
    box
  );

  return [names(pinned), names(listed)];
};

describe(sidebarLayout, () => {
  it("puts the box in the list where its first tab stands, in its own order", () => {
    expect(layout(["n", "b"])).toStrictEqual([
      ["g", "p"],
      ["a", "[n b]", "c"],
    ]);
  });

  it("puts a box holding a pinned tab first in the pinned area", () => {
    expect(layout(["p", "c"])).toStrictEqual([
      ["[p c]", "g"],
      ["a", "b", "n"],
    ]);
  });

  it("draws no box for none, or for fewer than two of its tabs shown", () => {
    expect([layout(), layout(["a", "gone"])]).toStrictEqual([
      [
        ["g", "p"],
        ["a", "b", "c", "n"],
      ],
      [
        ["g", "p"],
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
  it("is the profile's shown tabs top to bottom as the sidebar draws them", () => {
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
        split: {
          root: {
            direction: "row",
            children: [
              { size: 0.5, pane: "a" },
              { size: 0.5, pane: "n" },
            ],
          },
        },
      }).map(({ id }) => id)
    ).toStrictEqual(["gmail", "a", "n", "b", "c"]);
  });
});
