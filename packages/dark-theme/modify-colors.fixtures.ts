import type { RGBA } from "./color";
import type { Theme } from "./theme";

export const ADJUSTED_THEME: Theme = {
  mode: 1,
  brightness: 110,
  contrast: 105,
  grayscale: 5,
  sepia: 10,
  backgroundColor: "#10141a",
  textColor: "#d8d5cf",
};

// Deterministic xorshift32 color stream shared by the fixture generator and the
// bulk digest test, so both sides derive the exact same inputs without sharing
// any code from the modules under test.
export function buildRandomColors(count: number): RGBA[] {
  let state = 0x9e3779b9;

  const nextRandomUint32 = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state;
  };

  const colors: RGBA[] = [];

  for (let index = 0; index < count; index++) {
    const bits = nextRandomUint32();
    const red = bits & 255;
    const green = (bits >>> 8) & 255;
    const blue = (bits >>> 16) & 255;
    const alphaSelector = (bits >>> 24) & 15;
    const alpha =
      alphaSelector < 10 ? 1 : alphaSelector === 10 ? 0 : (nextRandomUint32() % 1000) / 1000;

    colors.push({ r: red, g: green, b: blue, a: alpha });
  }

  return colors;
}
