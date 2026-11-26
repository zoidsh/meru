import { describe, expect, it } from "vitest";

import { shortcutCards } from "./shortcut-cards.ts";

const commands = new Set([
  "a.one",
  "a.two",
  "b.nested",
  "tab.pinned.1",
  "tab.pinned.2",
  "profile.select.1",
]);

describe(shortcutCards, () => {
  it("lists each menu's commands in its order, a submenu's in place, and skips other items and menus with none", () => {
    expect(
      shortcutCards(
        [
          {
            label: "A",
            submenu: [
              { id: "a.two" },
              { label: "a separator, which has no id" },
              { label: "Copy", id: "edit.copy" },
              { id: "a.one" },
            ],
          },
          {
            label: "B",
            submenu: [
              {
                label: "Saved",
                submenu: [{ id: "x.made" }, { id: "b.nested" }],
              },
            ],
          },
          { label: "Help", submenu: [] },
        ],
        commands
      )
    ).toStrictEqual([
      { menu: "A", rows: [{ id: "a.two" }, { id: "a.one" }] },
      { menu: "B", rows: [{ id: "b.nested" }] },
    ]);
  });

  it("makes a family one row from its first command to its ninth, where its first item sits", () => {
    expect(
      shortcutCards(
        [
          {
            label: "Tabs",
            submenu: [
              { id: "a.one" },
              { id: "tab.pinned.1" },
              { id: "tab.pinned.2" },
              { id: "a.two" },
            ],
          },
          { label: "Window", submenu: [{ id: "profile.select.1" }] },
        ],
        commands
      )
    ).toStrictEqual([
      {
        menu: "Tabs",
        rows: [
          { id: "a.one" },
          { family: "pinned", first: "tab.pinned.1", last: "tab.pinned.9" },
          { id: "a.two" },
        ],
      },
      {
        menu: "Window",
        rows: [
          {
            family: "profile",
            first: "profile.select.1",
            last: "profile.select.9",
          },
        ],
      },
    ]);
  });
});
