import { composeFilterMatrix } from "./matrix";
import type { Theme } from "./theme";

// The SVG feColorMatrix value is the top four rows of the 5×5 filter matrix
// (SVG's matrix type has no fifth row — it's implicitly [0 0 0 0 1]).
export function getSVGFilterMatrixValue(theme: Theme): string {
  const matrix = composeFilterMatrix(theme);
  const values: string[] = [];

  for (let index = 0; index < 20; index++) {
    values.push((matrix[index] ?? 0).toFixed(3));
  }

  return values.join(" ");
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
