/** Chrome's `kPresetBrowserZoomFactorsArray`, so Meru steps through the same levels. */
const ZOOM_FACTORS = [
  0.25,
  1 / 3,
  0.5,
  2 / 3,
  0.75,
  0.8,
  0.9,
  1,
  1.1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
  4,
  5,
];

export const MIN_ZOOM_FACTOR = 0.25;
export const MAX_ZOOM_FACTOR = 5;

// Chromium stores a zoom level rather than the factor, so the factor it reads back can be a hair off the preset that was set
const ZOOM_FACTOR_EPSILON = 0.001;

export type ZoomDirection = "in" | "out";

/**
 * The first preset past `zoomFactor` in `direction`, as Chrome's `PageZoom::Zoom`
 * picks it, or `zoomFactor` itself at either end.
 */
export function getNextZoomFactor(zoomFactor: number, direction: ZoomDirection) {
  const nextZoomFactor =
    direction === "in"
      ? ZOOM_FACTORS.find((preset) => preset > zoomFactor + ZOOM_FACTOR_EPSILON)
      : [...ZOOM_FACTORS].reverse().find((preset) => preset < zoomFactor - ZOOM_FACTOR_EPSILON);

  return nextZoomFactor ?? zoomFactor;
}
