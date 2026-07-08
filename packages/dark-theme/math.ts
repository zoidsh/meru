/*
 * Ported from Dark Reader (https://github.com/darkreader/darkreader),
 * MIT License, Copyright (c) 2018-present Dark Reader Ltd.
 */

export type Matrix5x5 = [
  [number, number, number, number, number],
  [number, number, number, number, number],
  [number, number, number, number, number],
  [number, number, number, number, number],
  [number, number, number, number, number],
];

export type Matrix5x1 = [[number], [number], [number], [number], [number]];

export type Matrix = Matrix5x5 | Matrix5x1;

export function scale(
  x: number,
  inLow: number,
  inHigh: number,
  outLow: number,
  outHigh: number,
): number {
  return ((x - inLow) * (outHigh - outLow)) / (inHigh - inLow) + outLow;
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

export function multiplyMatrices<M extends Matrix>(m1: Matrix5x5, m2: Matrix5x5 | Matrix5x1): M {
  const result: number[][] = [];

  for (let row = 0, rows = m1.length; row < rows; row++) {
    result[row] = [];

    for (let column = 0, columns = m2[0].length; column < columns; column++) {
      let sum = 0;

      for (let index = 0, inner = m1[0].length; index < inner; index++) {
        sum += m1[row][index] * m2[index][column];
      }

      result[row][column] = sum;
    }
  }

  return result as M;
}
