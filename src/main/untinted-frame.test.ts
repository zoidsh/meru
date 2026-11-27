import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "#core/tonal-tint.ts";

/** One of shadcn's greys, `oklch(L 0 0)`, as `#rrggbb`. */
const greyHex = (value: string) => {
  const lightness = Number(
    /^oklch\((?<lightness>[\d.]+) 0 0\)$/u.exec(value)?.groups?.lightness
  );
  const linear = lightness ** 3;
  const encoded =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

  return `#${Math.round(encoded * 255)
    .toString(16)
    .padStart(2, "0")
    .repeat(3)}`;
};

/** `hex` at half opacity over `ground`, composited in sRGB as Chromium does. */
const halfOver = (hex: string, ground: string) =>
  `#${[1, 3, 5]
    .map((at) =>
      Math.round(
        (Number.parseInt(hex.slice(at, at + 2), 16) +
          Number.parseInt(ground.slice(at, at + 2), 16)) /
          2
      )
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

describe("the untinted frame", () => {
  const css = readFileSync(
    path.join(import.meta.dirname, "..", "ui", "styles.css"),
    "utf-8"
  );
  /** Every value `styles.css` gives `token`, in its order. */
  const declared = (token: string) =>
    [...css.matchAll(new RegExp(`^\\s+--${token}: ([^;]+);`, "gmu"))].map(
      (match) => match[1] ?? ""
    );
  const [lightShell = "", darkShell = ""] = declared("shell");
  const muted = declared("muted-foreground");
  // The frame's own grey in light, the only hex; shadcn's dark grey after it.
  const lightMuted = muted.find((value) => value.startsWith("#")) ?? "";
  const [, darkMuted] = muted.filter((value) => value.startsWith("oklch("));
  const frames = [
    ["light", lightShell, lightMuted],
    ["dark", darkShell, greyHex(darkMuted ?? "")],
  ] as const;

  it("keeps the light frame's muted grey at its tone before the tonal palette, and the dark frame's shadcn's", () => {
    expect(frames).toStrictEqual([
      ["light", "#ebebeb", "#555555"],
      ["dark", "#1d1d1d", "#a1a1a1"],
    ]);
  });

  it.each(frames)(
    "keeps the frame's muted text at least 4.5:1 on the shell, and a disabled control's half opacity weaker yet at least 2:1, %s",
    (_theme, shell, foreground) => {
      const dimmed = halfOver(foreground, shell);

      expect(contrastRatio(foreground, shell)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dimmed, shell)).toBeGreaterThanOrEqual(2);
      expect(contrastRatio(dimmed, shell)).toBeLessThan(
        contrastRatio(foreground, shell)
      );
    }
  );
});
