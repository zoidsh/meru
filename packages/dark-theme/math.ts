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
  const columns = m2[0]?.length ?? 0;
  const inner = m1[0]?.length ?? 0;

  for (let row = 0; row < m1.length; row++) {
    const m1Row = m1[row] ?? [];
    const resultRow: number[] = [];

    for (let column = 0; column < columns; column++) {
      let sum = 0;

      for (let index = 0; index < inner; index++) {
        sum += (m1Row[index] ?? 0) * (m2[index]?.[column] ?? 0);
      }

      resultRow[column] = sum;
    }

    result[row] = resultRow;
  }

  return result as M;
}
