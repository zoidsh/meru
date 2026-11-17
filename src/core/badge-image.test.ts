import { describe, expect, it } from "vitest";

import { badgeDigits, drawUnreadBadge } from "./badge-image.ts";
import type { Bitmap } from "./badge-image.ts";

const pixel = ({ width, pixels }: Bitmap, x: number, y: number) => {
  const at = (y * width + x) * 4;

  return {
    blue: pixels[at],
    green: pixels[at + 1],
    red: pixels[at + 2],
    alpha: pixels[at + 3],
  };
};

const whitePixels = (image: Bitmap) => {
  let count = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const { red, green, blue } = pixel(image, x, y);

      count += red === 0xff && green === 0xff && blue === 0xff ? 1 : 0;
    }
  }

  return count;
};

describe(badgeDigits, () => {
  it("caps a count above 99 as every other count is", () => {
    expect(badgeDigits(7)).toBe("7");
    expect(badgeDigits(99)).toBe("99");
    expect(badgeDigits(100)).toBe("99+");
  });
});

describe(drawUnreadBadge, () => {
  it("is a square of the size asked, in four bytes a pixel", () => {
    for (const size of [16, 32]) {
      const image = drawUnreadBadge(5, size);

      expect(image.width).toBe(size);
      expect(image.height).toBe(size);
      expect(image.pixels).toHaveLength(size * size * 4);
    }
  });

  it("is a red disc, clear in its corners", () => {
    const image = drawUnreadBadge(1, 16);

    expect(pixel(image, 0, 0).alpha).toBe(0);
    expect(pixel(image, 15, 15).alpha).toBe(0);
    expect(pixel(image, 2, 8)).toStrictEqual({
      blue: 0x3a,
      green: 0x41,
      red: 0xf0,
      alpha: 0xff,
    });
  });

  it("premultiplies the disc's edge", () => {
    const edge = pixel(drawUnreadBadge(1, 32), 4, 4);

    expect(edge.alpha).toBeGreaterThan(0);
    expect(edge.alpha).toBeLessThan(0xff);
    expect(edge.red).toBeLessThanOrEqual(edge.alpha ?? 0);
  });

  it("draws each digit in white, and a count past the cap as the cap", () => {
    expect(whitePixels(drawUnreadBadge(1, 16))).toBeGreaterThan(0);
    expect(whitePixels(drawUnreadBadge(8, 16))).toBeGreaterThan(
      whitePixels(drawUnreadBadge(1, 16))
    );
    expect(whitePixels(drawUnreadBadge(88, 16))).toBeGreaterThan(0);
    expect(whitePixels(drawUnreadBadge(100, 32))).toBe(
      whitePixels(drawUnreadBadge(5000, 32))
    );
  });

  it("draws the digits larger at the larger size", () => {
    expect(whitePixels(drawUnreadBadge(42, 32))).toBeGreaterThan(
      whitePixels(drawUnreadBadge(42, 16))
    );
  });
});
