import { describe, expect, it } from "vitest";

import {
  badgeText,
  OVERLAY_SIZE,
  overlayPixels,
  overlayText,
} from "./badge.ts";

describe(overlayText, () => {
  it("shows nothing at none, the count up to 999 and 1k+ past it, where the dock shows the count whole", () => {
    expect([0, 7, 999, 1000, 4321].map(overlayText)).toStrictEqual([
      "",
      "7",
      "999",
      "1k+",
      "1k+",
    ]);
    expect(badgeText(4321)).toBe("4321");
  });
});

const art = (total: number) => {
  const pixels = overlayPixels(total);
  return Array.from({ length: OVERLAY_SIZE }, (_, y) =>
    Array.from({ length: OVERLAY_SIZE }, (__, x) => {
      const offset = (y * OVERLAY_SIZE + x) * 4;
      if (pixels[offset + 3] === 0) {
        return " ";
      }
      return pixels[offset + 1] === 0xff ? "#" : ".";
    }).join("")
  );
};

describe(overlayPixels, () => {
  it("draws the count in white on a red disc with clear corners, three characters at most", () => {
    expect([art(1), art(1000).slice(5, 10)]).toStrictEqual([
      [
        "     ......     ",
        "   ..........   ",
        "  ............  ",
        " .............. ",
        " .............. ",
        ".......#........",
        "......##........",
        ".......#........",
        ".......#........",
        "......###.......",
        "................",
        " .............. ",
        " .............. ",
        "  ............  ",
        "   ..........   ",
        "     ......     ",
      ],
      [
        "...#..#.........",
        "..##..#.#..#....",
        "...#..##..###...",
        "...#..#.#..#....",
        "..###.#.#.......",
      ],
    ]);
  });
});
