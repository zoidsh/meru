/*
 * Ported from Dark Reader (https://github.com/darkreader/darkreader),
 * MIT License, Copyright (c) 2018-present Dark Reader Ltd.
 */

import { clamp, type Matrix5x1, type Matrix5x5, multiplyMatrices } from "./math";
import type { Theme } from "./theme";

export function createFilterMatrix(theme: Theme): Matrix5x5 {
  let matrix: Matrix5x5 = Matrix.identity();

  if (theme.sepia !== 0) {
    matrix = multiplyMatrices(matrix, Matrix.sepia(theme.sepia / 100));
  }

  if (theme.grayscale !== 0) {
    matrix = multiplyMatrices(matrix, Matrix.grayscale(theme.grayscale / 100));
  }

  if (theme.contrast !== 100) {
    matrix = multiplyMatrices(matrix, Matrix.contrast(theme.contrast / 100));
  }

  if (theme.brightness !== 100) {
    matrix = multiplyMatrices(matrix, Matrix.brightness(theme.brightness / 100));
  }

  if (theme.mode === 1) {
    matrix = multiplyMatrices(matrix, Matrix.invertNHue());
  }

  return matrix;
}

export function applyColorMatrix(
  [red, green, blue]: [number, number, number],
  matrix: Matrix5x5,
): [number, number, number] {
  const rgbColumn: Matrix5x1 = [[red / 255], [green / 255], [blue / 255], [1], [1]];
  const result = multiplyMatrices<Matrix5x1>(matrix, rgbColumn);

  return [0, 1, 2].map((index) => clamp(Math.round((result[index]?.[0] ?? 0) * 255), 0, 255)) as [
    number,
    number,
    number,
  ];
}

export const Matrix = {
  identity(): Matrix5x5 {
    return [
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  invertNHue(): Matrix5x5 {
    return [
      [0.333, -0.667, -0.667, 0, 1],
      [-0.667, 0.333, -0.667, 0, 1],
      [-0.667, -0.667, 0.333, 0, 1],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  brightness(value: number): Matrix5x5 {
    return [
      [value, 0, 0, 0, 0],
      [0, value, 0, 0, 0],
      [0, 0, value, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  contrast(value: number): Matrix5x5 {
    const offset = (1 - value) / 2;

    return [
      [value, 0, 0, 0, offset],
      [0, value, 0, 0, offset],
      [0, 0, value, 0, offset],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  sepia(value: number): Matrix5x5 {
    return [
      [0.393 + 0.607 * (1 - value), 0.769 - 0.769 * (1 - value), 0.189 - 0.189 * (1 - value), 0, 0],
      [0.349 - 0.349 * (1 - value), 0.686 + 0.314 * (1 - value), 0.168 - 0.168 * (1 - value), 0, 0],
      [0.272 - 0.272 * (1 - value), 0.534 - 0.534 * (1 - value), 0.131 + 0.869 * (1 - value), 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },

  grayscale(value: number): Matrix5x5 {
    return [
      [
        0.2126 + 0.7874 * (1 - value),
        0.7152 - 0.7152 * (1 - value),
        0.0722 - 0.0722 * (1 - value),
        0,
        0,
      ],
      [
        0.2126 - 0.2126 * (1 - value),
        0.7152 + 0.2848 * (1 - value),
        0.0722 - 0.0722 * (1 - value),
        0,
        0,
      ],
      [
        0.2126 - 0.2126 * (1 - value),
        0.7152 - 0.7152 * (1 - value),
        0.0722 + 0.9278 * (1 - value),
        0,
        0,
      ],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
  },
};
