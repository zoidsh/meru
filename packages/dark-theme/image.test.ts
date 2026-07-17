import { describe, expect, test } from "bun:test";
import {
  analyzeImagePixelData,
  getFilteredImageURL,
  getSolidColorImageURL,
  type ImageDetails,
  shouldInvertDarkImage,
} from "./image";
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
    hasPhotographicTonalRange: false,
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

describe("shouldInvertDarkImage", () => {
  test("inverts a small dark transparent icon", () => {
    expect(shouldInvertDarkImage(buildImageDetails({}))).toBe(true);
  });

  test("skips an image that is not dark", () => {
    expect(shouldInvertDarkImage(buildImageDetails({ isDark: false }))).toBe(false);
  });

  test("skips an image that is not transparent", () => {
    expect(shouldInvertDarkImage(buildImageDetails({ isTransparent: false }))).toBe(false);
  });

  test("skips a large image", () => {
    expect(shouldInvertDarkImage(buildImageDetails({ isLarge: true }))).toBe(false);
  });

  test("skips an image with a photographic tonal range", () => {
    expect(shouldInvertDarkImage(buildImageDetails({ hasPhotographicTonalRange: true }))).toBe(
      false,
    );
  });

  test("skips an image no wider than 2 pixels", () => {
    expect(shouldInvertDarkImage(buildImageDetails({ width: 2 }))).toBe(false);
  });
});

type PixelRun = {
  rgba: [number, number, number, number];
  count: number;
};

function buildPixelData(pixelRuns: PixelRun[]): Uint8ClampedArray {
  const totalPixelCount = pixelRuns.reduce(
    (pixelCount, pixelRun) => pixelCount + pixelRun.count,
    0,
  );
  const pixels = new Uint8ClampedArray(totalPixelCount * 4);
  let pixelOffset = 0;

  for (const pixelRun of pixelRuns) {
    for (let runIndex = 0; runIndex < pixelRun.count; runIndex++) {
      pixels.set(pixelRun.rgba, pixelOffset);
      pixelOffset += 4;
    }
  }

  return pixels;
}

const BLACK: [number, number, number, number] = [0, 0, 0, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0];

describe("analyzeImagePixelData", () => {
  test("classifies a flat dark icon on a transparent background as invertible", () => {
    const analysis = analyzeImagePixelData(
      buildPixelData([
        { rgba: BLACK, count: 700 },
        { rgba: TRANSPARENT, count: 300 },
      ]),
      1000,
    );

    expect(analysis.isDark).toBe(true);
    expect(analysis.isTransparent).toBe(true);
    expect(analysis.isLarge).toBe(false);
    expect(analysis.hasPhotographicTonalRange).toBe(false);
  });

  test("keeps a dark logo with white text invertible", () => {
    const analysis = analyzeImagePixelData(
      buildPixelData([
        { rgba: BLACK, count: 800 },
        { rgba: WHITE, count: 100 },
        { rgba: TRANSPARENT, count: 100 },
      ]),
      1000,
    );

    expect(analysis.isDark).toBe(true);
    expect(analysis.hasPhotographicTonalRange).toBe(false);
  });

  test("keeps a dark logo with a colored accent invertible", () => {
    const analysis = analyzeImagePixelData(
      buildPixelData([
        { rgba: BLACK, count: 850 },
        { rgba: [255, 150, 0, 255], count: 50 },
        { rgba: TRANSPARENT, count: 100 },
      ]),
      1000,
    );

    expect(analysis.isDark).toBe(true);
    expect(analysis.hasPhotographicTonalRange).toBe(false);
  });

  test("detects a photographic tonal range in a dark transparent photo", () => {
    const analysis = analyzeImagePixelData(
      buildPixelData([
        { rgba: [10, 10, 10, 255], count: 300 },
        { rgba: [40, 40, 40, 255], count: 250 },
        { rgba: [70, 70, 70, 255], count: 150 },
        { rgba: [95, 95, 95, 255], count: 100 },
        { rgba: [150, 150, 150, 255], count: 50 },
        { rgba: [220, 220, 220, 255], count: 30 },
        { rgba: TRANSPARENT, count: 120 },
      ]),
      1000,
    );

    expect(analysis.isDark).toBe(true);
    expect(analysis.isTransparent).toBe(true);
    expect(analysis.hasPhotographicTonalRange).toBe(true);
  });

  test("ignores lightness bands below the significance floor", () => {
    const analysis = analyzeImagePixelData(
      buildPixelData([
        { rgba: BLACK, count: 900 },
        { rgba: [128, 128, 128, 255], count: 5 },
        { rgba: [200, 200, 200, 255], count: 5 },
        { rgba: TRANSPARENT, count: 90 },
      ]),
      1000,
    );

    expect(analysis.hasPhotographicTonalRange).toBe(false);
  });

  test("classifies size from the source pixel count", () => {
    const pixels = buildPixelData([{ rgba: BLACK, count: 4 }]);

    expect(analyzeImagePixelData(pixels, 512 * 512).isLarge).toBe(false);
    expect(analyzeImagePixelData(pixels, 512 * 512 + 1).isLarge).toBe(true);
  });
});
