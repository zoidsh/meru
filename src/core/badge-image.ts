import { MAX_SHOWN_UNREAD } from "./unread.ts";

/** Raw pixels as Electron's `nativeImage.createFromBitmap` takes them. */
export interface Bitmap {
  width: number;
  height: number;
  /** Rows top first, each pixel blue, green, red, alpha, premultiplied. */
  pixels: Uint8Array;
}

const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;

/** 3×5 glyphs: five rows top first, each three pixels left to right. */
const GLYPHS: Readonly<Record<string, string>> = {
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "111001111100111",
  "3": "111001111001111",
  "4": "101101111001001",
  "5": "111100111001111",
  "6": "111100111101111",
  "7": "111001001001001",
  "8": "111101111101111",
  "9": "111101111001111",
  "+": "000010111010000",
};

/** v3's badge red, #F0413A. */
const RED = { red: 0xf0, green: 0x41, blue: 0x3a };

/** Samples per pixel along each axis, for the circle's edge. */
const SAMPLES = 4;

/** The digits drawn, capped as every other unread count is. */
export const badgeDigits = (count: number) =>
  count > MAX_SHOWN_UNREAD ? `${MAX_SHOWN_UNREAD}+` : String(count);

/**
 * A red disc `size` pixels across with the count in white, for the Windows
 * taskbar's overlay, drawn here since main has no canvas.
 */
export const drawUnreadBadge = (count: number, size: number): Bitmap => {
  const glyphs = [...badgeDigits(count)].map(
    (character) => GLYPHS[character] ?? ""
  );
  const columns = glyphs.length * (GLYPH_WIDTH + 1) - 1;
  const scale = Math.max(
    1,
    Math.floor(Math.min((size * 0.75) / columns, (size * 0.65) / GLYPH_HEIGHT))
  );
  const left = Math.floor((size - columns * scale) / 2);
  const top = Math.floor((size - GLYPH_HEIGHT * scale) / 2);

  const isInk = (x: number, y: number) => {
    const column = Math.floor((x - left) / scale);
    const row = Math.floor((y - top) / scale);
    const glyph = glyphs[Math.floor(column / (GLYPH_WIDTH + 1))];
    const within = column % (GLYPH_WIDTH + 1);

    return (
      column >= 0 &&
      row >= 0 &&
      row < GLYPH_HEIGHT &&
      within < GLYPH_WIDTH &&
      glyph?.[row * GLYPH_WIDTH + within] === "1"
    );
  };

  const radius = size / 2;

  const coverage = (x: number, y: number) => {
    let inside = 0;

    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        const dx = x + (sx + 0.5) / SAMPLES - radius;
        const dy = y + (sy + 0.5) / SAMPLES - radius;

        inside += dx * dx + dy * dy <= radius * radius ? 1 : 0;
      }
    }

    return inside / (SAMPLES * SAMPLES);
  };

  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = coverage(x, y);
      const color = isInk(x, y) ? { red: 0xff, green: 0xff, blue: 0xff } : RED;
      const at = (y * size + x) * 4;

      pixels[at] = Math.round(color.blue * alpha);
      pixels[at + 1] = Math.round(color.green * alpha);
      pixels[at + 2] = Math.round(color.red * alpha);
      pixels[at + 3] = Math.round(0xff * alpha);
    }
  }

  return { width: size, height: size, pixels };
};
