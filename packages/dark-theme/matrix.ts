import { clamp } from "./math";
import type { Theme } from "./theme";

// A 5×5 color matrix stored flat in row-major order, operating on the column
// vector [r, g, b, a, 1] with channels normalized to 0–1.
export type ColorMatrix = number[];

function identityMatrix(): ColorMatrix {
  return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
}

function invertWithHuePreservedMatrix(): ColorMatrix {
  return [
    0.333, -0.667, -0.667, 0, 1, -0.667, 0.333, -0.667, 0, 1, -0.667, -0.667, 0.333, 0, 1, 0, 0, 0,
    1, 0, 0, 0, 0, 0, 1,
  ];
}

function brightnessMatrix(amount: number): ColorMatrix {
  return [amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
}

function contrastMatrix(amount: number): ColorMatrix {
  const offset = (1 - amount) / 2;

  return [
    amount,
    0,
    0,
    0,
    offset,
    0,
    amount,
    0,
    0,
    offset,
    0,
    0,
    amount,
    0,
    offset,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
  ];
}

function sepiaMatrix(amount: number): ColorMatrix {
  const remainder = 1 - amount;

  return [
    0.393 + 0.607 * remainder,
    0.769 - 0.769 * remainder,
    0.189 - 0.189 * remainder,
    0,
    0,
    0.349 - 0.349 * remainder,
    0.686 + 0.314 * remainder,
    0.168 - 0.168 * remainder,
    0,
    0,
    0.272 - 0.272 * remainder,
    0.534 - 0.534 * remainder,
    0.131 + 0.869 * remainder,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
  ];
}

function grayscaleMatrix(amount: number): ColorMatrix {
  const remainder = 1 - amount;

  return [
    0.2126 + 0.7874 * remainder,
    0.7152 - 0.7152 * remainder,
    0.0722 - 0.0722 * remainder,
    0,
    0,
    0.2126 - 0.2126 * remainder,
    0.7152 + 0.2848 * remainder,
    0.0722 - 0.0722 * remainder,
    0,
    0,
    0.2126 - 0.2126 * remainder,
    0.7152 - 0.7152 * remainder,
    0.0722 + 0.9278 * remainder,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
  ];
}

function multiplyColorMatrices(left: ColorMatrix, right: ColorMatrix): ColorMatrix {
  const product: number[] = new Array(25);

  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      let sum = 0;

      for (let term = 0; term < 5; term++) {
        sum += (left[row * 5 + term] ?? 0) * (right[term * 5 + column] ?? 0);
      }

      product[row * 5 + column] = sum;
    }
  }

  return product;
}

export function composeFilterMatrix(theme: Theme): ColorMatrix {
  const factors: ColorMatrix[] = [];

  if (theme.sepia !== 0) {
    factors.push(sepiaMatrix(theme.sepia / 100));
  }

  if (theme.grayscale !== 0) {
    factors.push(grayscaleMatrix(theme.grayscale / 100));
  }

  if (theme.contrast !== 100) {
    factors.push(contrastMatrix(theme.contrast / 100));
  }

  if (theme.brightness !== 100) {
    factors.push(brightnessMatrix(theme.brightness / 100));
  }

  if (theme.mode === 1) {
    factors.push(invertWithHuePreservedMatrix());
  }

  let composed: ColorMatrix | null = null;

  for (const factor of factors) {
    composed = composed ? multiplyColorMatrices(composed, factor) : factor;
  }

  return composed ?? identityMatrix();
}

export function transformColorChannels(
  red: number,
  green: number,
  blue: number,
  matrix: ColorMatrix,
): [number, number, number] {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;

  const channelAt = (row: number) => {
    const rowStart = row * 5;
    const transformed =
      (matrix[rowStart] ?? 0) * normalizedRed +
      (matrix[rowStart + 1] ?? 0) * normalizedGreen +
      (matrix[rowStart + 2] ?? 0) * normalizedBlue +
      (matrix[rowStart + 3] ?? 0) +
      (matrix[rowStart + 4] ?? 0);

    return clamp(Math.round(transformed * 255), 0, 255);
  };

  return [channelAt(0), channelAt(1), channelAt(2)];
}
