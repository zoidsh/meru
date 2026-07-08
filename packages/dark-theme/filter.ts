/*
 * SVG feColorMatrix value and CSS filter helpers ported from Dark Reader
 * (https://github.com/darkreader/darkreader), MIT License,
 * Copyright (c) 2018-present Dark Reader Ltd.
 */

import { createFilterMatrix } from "./matrix";
import type { Theme } from "./theme";

function toSVGMatrix(matrix: number[][]): string {
  return matrix
    .slice(0, 4)
    .map((row) => row.map((value) => value.toFixed(3)).join(" "))
    .join(" ");
}

export function getSVGFilterMatrixValue(theme: Theme): string {
  return toSVGMatrix(createFilterMatrix(theme));
}

export function getCSSFilterValue(theme: Theme): string {
  const filters: string[] = [];

  if (theme.brightness !== 100) {
    filters.push(`brightness(${theme.brightness}%)`);
  }

  if (theme.contrast !== 100) {
    filters.push(`contrast(${theme.contrast}%)`);
  }

  if (theme.sepia !== 0) {
    filters.push(`sepia(${theme.sepia}%)`);
  }

  if (theme.grayscale !== 0) {
    filters.push(`grayscale(${theme.grayscale}%)`);
  }

  filters.push("invert(100%)", "hue-rotate(180deg)");

  return filters.join(" ");
}
