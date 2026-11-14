/** The unread count on the app's icon: nothing at none. */
export const badgeText = (total: number): string =>
  total > 0 ? String(total) : "";

/** The count as the taskbar's overlay has room for, which is three characters. */
export const overlayText = (total: number): string =>
  total > 999 ? "1k+" : badgeText(total);

export const OVERLAY_SIZE = 16;

/** 3.x's badge red, which reads on a light and a dark taskbar. */
const BADGE_COLOR = [0xf0, 0x41, 0x3a, 0xff] as const;
const TEXT_COLOR = [0xff, 0xff, 0xff, 0xff] as const;

// Three pixels wide and five high, the most that fits three characters on a 16px icon.
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "+": ["000", "010", "111", "010", "000"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  k: ["100", "101", "110", "101", "101"],
};

const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;

// Electron's main process has no canvas, so the taskbar's overlay is drawn pixel by pixel.
/** The taskbar overlay for a count, as RGBA rows: the count in white on a red disc. */
export const overlayPixels = (total: number): Uint8Array => {
  const pixels = new Uint8Array(OVERLAY_SIZE * OVERLAY_SIZE * 4);
  const paint = (x: number, y: number, color: readonly number[]) => {
    pixels.set(color, (y * OVERLAY_SIZE + x) * 4);
  };
  const centre = (OVERLAY_SIZE - 1) / 2;
  for (let y = 0; y < OVERLAY_SIZE; y += 1) {
    for (let x = 0; x < OVERLAY_SIZE; x += 1) {
      if (Math.hypot(x - centre, y - centre) <= OVERLAY_SIZE / 2) {
        paint(x, y, BADGE_COLOR);
      }
    }
  }
  const text = overlayText(total).split("");
  const width = text.length * (GLYPH_WIDTH + 1) - 1;
  const left = Math.floor((OVERLAY_SIZE - width) / 2);
  const top = Math.floor((OVERLAY_SIZE - GLYPH_HEIGHT) / 2);
  for (const [index, char] of text.entries()) {
    for (const [row, bits] of (GLYPHS[char] ?? []).entries()) {
      for (let column = 0; column < GLYPH_WIDTH; column += 1) {
        if (bits[column] === "1") {
          paint(
            left + index * (GLYPH_WIDTH + 1) + column,
            top + row,
            TEXT_COLOR
          );
        }
      }
    }
  }
  return pixels;
};
