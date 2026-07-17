import { describe, expect, test } from "bun:test";
import { getFilteredImageURL, getSolidColorImageURL, type ImageDetails } from "./image";
import { ADJUSTED_THEME } from "./modify-colors.fixtures";
import { DEFAULT_THEME } from "./theme";

const DEFAULT_THEME_MATRIX =
  "0.333 -0.667 -0.667 0.000 1.000 -0.667 0.333 -0.667 0.000 1.000 -0.667 -0.667 0.333 0.000 1.000 0.000 0.000 0.000 1.000 0.000";
const ADJUSTED_THEME_MATRIX =
  "0.246 -0.670 -0.772 0.000 1.170 -0.735 0.319 -0.763 0.000 1.153 -0.723 -0.666 0.241 0.000 1.123 0.000 0.000 0.000 1.000 0.000";

function buildImageDetails(overrides: Partial<ImageDetails>): ImageDetails {
  return {
    src: "https://example.com/icon.png",
    dataURL: "data:image/png;base64,AAAA",
    width: 24,
    height: 24,
    isDark: true,
    isLight: false,
    isTransparent: true,
    isLarge: false,
    solidColor: null,
    ...overrides,
  };
}

function buildFilteredSvgDataUrl(
  width: number,
  height: number,
  matrix: string,
  href: string,
): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">` +
    `<defs><filter id="dark-theme-image-filter"><feColorMatrix type="matrix" values="${matrix}" /></filter></defs>` +
    `<image width="${width}" height="${height}" filter="url(#dark-theme-image-filter)" xlink:href="${href}" /></svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

describe("getFilteredImageURL", () => {
  test("wraps a raster data url in a filtered SVG", () => {
    expect(getFilteredImageURL(buildImageDetails({}), DEFAULT_THEME)).toBe(
      buildFilteredSvgDataUrl(24, 24, DEFAULT_THEME_MATRIX, "data:image/png;base64,AAAA"),
    );
  });

  test("uses the theme's filter matrix", () => {
    expect(getFilteredImageURL(buildImageDetails({ width: 10, height: 5 }), ADJUSTED_THEME)).toBe(
      buildFilteredSvgDataUrl(10, 5, ADJUSTED_THEME_MATRIX, "data:image/png;base64,AAAA"),
    );
  });

  test("escapes an SVG data url before embedding it", () => {
    const svgDataUrl = `data:image/svg+xml,<svg width='10' height="5" & more/>`;

    expect(getFilteredImageURL(buildImageDetails({ dataURL: svgDataUrl }), DEFAULT_THEME)).toBe(
      buildFilteredSvgDataUrl(
        24,
        24,
        DEFAULT_THEME_MATRIX,
        "data:image/svg+xml,&lt;svg width=&apos;10&apos; height=&quot;5&quot; &amp; more/&gt;",
      ),
    );
  });
});

describe("getSolidColorImageURL", () => {
  test("builds a solid rect of the given color", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="5" height="7">` +
      `<rect width="100%" height="100%" fill="rgb(1, 2, 3)" /></svg>`;

    expect(getSolidColorImageURL(buildImageDetails({ width: 5, height: 7 }), "rgb(1, 2, 3)")).toBe(
      `data:image/svg+xml;base64,${btoa(svg)}`,
    );
  });
});
