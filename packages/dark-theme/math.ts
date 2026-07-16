export function scale(
  value: number,
  inputLow: number,
  inputHigh: number,
  outputLow: number,
  outputHigh: number,
): number {
  return ((value - inputLow) * (outputHigh - outputLow)) / (inputHigh - inputLow) + outputLow;
}

export function clamp(value: number, lowerBound: number, upperBound: number): number {
  return Math.min(upperBound, Math.max(lowerBound, value));
}

export type Matrix5x5 = number[];
