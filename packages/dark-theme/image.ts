import { getSRGBLightness, type RGBA } from "./color";
import { getSVGFilterMatrixValue } from "./filter";
import type { Theme } from "./theme";

export type ImageDetails = {
  src: string;
  dataURL: string;
  width: number;
  height: number;
  isDark: boolean;
  isLight: boolean;
  isTransparent: boolean;
  isLarge: boolean;
  solidColor: RGBA | null;
};

const MAX_ANALYSIS_PIXEL_COUNT = 32 * 32;
const LARGE_IMAGE_PIXEL_COUNT = 512 * 512;

// Per-axis cap on the analysis canvas. A scaled draw wider than this (an
// extreme aspect ratio like a 2048×1 strip) gets clipped, and getImageData
// reads the clipped range back as transparent black — those pixels count as
// transparent in the classification.
const ANALYSIS_CANVAS_SIDE_LIMIT = 1024;

const TRANSPARENT_ALPHA_THRESHOLD = 0.05;
const DARK_PIXEL_LIGHTNESS_THRESHOLD = 0.4;
const LIGHT_PIXEL_LIGHTNESS_THRESHOLD = 0.7;
const DARK_IMAGE_PIXEL_RATIO = 0.7;
const LIGHT_IMAGE_PIXEL_RATIO = 0.7;
const TRANSPARENT_IMAGE_PIXEL_RATIO = 0.1;
const SOLID_IMAGE_LIGHTNESS_SPREAD = 0.1;

let analysisCanvas: HTMLCanvasElement | null = null;
let analysisContext: CanvasRenderingContext2D | null = null;

// The canvas starts empty and only ever grows (up to the side limit), so the
// steady-state footprint stays at icon size instead of a fixed worst-case
// allocation. Resizing a canvas resets its context state, so smoothing is
// re-disabled after every growth — smoothed downscales would change the pixels
// the classifier sees.
function getAnalysisContext(
  requiredWidth: number,
  requiredHeight: number,
): CanvasRenderingContext2D | null {
  if (!analysisCanvas) {
    analysisCanvas = document.createElement("canvas");
    analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });

    if (analysisContext) {
      analysisContext.imageSmoothingEnabled = false;
    }
  }

  if (!analysisContext) {
    return null;
  }

  const targetWidth = Math.min(requiredWidth, ANALYSIS_CANVAS_SIDE_LIMIT);
  const targetHeight = Math.min(requiredHeight, ANALYSIS_CANVAS_SIDE_LIMIT);
  let resized = false;

  if (analysisCanvas.width < targetWidth) {
    analysisCanvas.width = targetWidth;
    resized = true;
  }

  if (analysisCanvas.height < targetHeight) {
    analysisCanvas.height = targetHeight;
    resized = true;
  }

  if (resized) {
    analysisContext.imageSmoothingEnabled = false;
  }

  return analysisContext;
}

type ImageAnalysis = Omit<ImageDetails, "src" | "dataURL" | "width" | "height">;

function analyzeImagePixels(image: HTMLImageElement): ImageAnalysis | null {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (sourceWidth === 0 || sourceHeight === 0) {
    return null;
  }

  const scaleFactor = Math.min(
    1,
    Math.sqrt(MAX_ANALYSIS_PIXEL_COUNT / (sourceWidth * sourceHeight)),
  );
  const width = Math.ceil(sourceWidth * scaleFactor);
  const height = Math.ceil(sourceHeight * scaleFactor);

  const context = getAnalysisContext(width, height);

  if (!context) {
    return null;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);

  let pixels: Uint8ClampedArray;

  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }

  let transparentPixelCount = 0;
  let darkPixelCount = 0;
  let lightPixelCount = 0;
  let minLightness = 1;
  let maxLightness = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let alphaSum = 0;

  // One 32-bit read per pixel instead of four byte reads. Chromium only ships
  // on little-endian platforms, so the RGBA bytes always land as R in the low
  // byte through A in the high byte.
  const pixelLanes = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.length / 4);

  for (let pixelIndex = 0; pixelIndex < pixelLanes.length; pixelIndex++) {
    const pixelLane = pixelLanes[pixelIndex] ?? 0;
    const red = pixelLane & 255;
    const green = (pixelLane >>> 8) & 255;
    const blue = (pixelLane >>> 16) & 255;
    const alpha = pixelLane >>> 24;

    redSum += red;
    greenSum += green;
    blueSum += blue;
    alphaSum += alpha;

    if (alpha / 255 < TRANSPARENT_ALPHA_THRESHOLD) {
      transparentPixelCount++;

      continue;
    }

    const lightness = getSRGBLightness(red, green, blue);

    if (lightness < DARK_PIXEL_LIGHTNESS_THRESHOLD) {
      darkPixelCount++;
    }

    if (lightness > LIGHT_PIXEL_LIGHTNESS_THRESHOLD) {
      lightPixelCount++;
    }

    if (lightness < minLightness) {
      minLightness = lightness;
    }

    if (lightness > maxLightness) {
      maxLightness = lightness;
    }
  }

  const totalPixelCount = width * height;
  const opaquePixelCount = totalPixelCount - transparentPixelCount;

  const isFullyOpaque = alphaSum === totalPixelCount * 255;
  const isSolid = isFullyOpaque && maxLightness - minLightness < SOLID_IMAGE_LIGHTNESS_SPREAD;

  return {
    isDark: opaquePixelCount > 0 && darkPixelCount / opaquePixelCount >= DARK_IMAGE_PIXEL_RATIO,
    isLight: opaquePixelCount > 0 && lightPixelCount / opaquePixelCount >= LIGHT_IMAGE_PIXEL_RATIO,
    isTransparent: transparentPixelCount / totalPixelCount >= TRANSPARENT_IMAGE_PIXEL_RATIO,
    isLarge: sourceWidth * sourceHeight > LARGE_IMAGE_PIXEL_COUNT,
    solidColor:
      isSolid && opaquePixelCount > 0
        ? {
            r: Math.round(redSum / opaquePixelCount),
            g: Math.round(greenSum / opaquePixelCount),
            b: Math.round(blueSum / opaquePixelCount),
            a: transparentPixelCount / totalPixelCount,
          }
        : null,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image ${url}`));
    image.src = url;
  });
}

let snapshotCanvas: HTMLCanvasElement | null = null;

function imageToDataURL(image: HTMLImageElement): string {
  if (!snapshotCanvas) {
    snapshotCanvas = document.createElement("canvas");
  }

  snapshotCanvas.width = image.naturalWidth;
  snapshotCanvas.height = image.naturalHeight;

  const context = snapshotCanvas.getContext("2d");

  if (!context) {
    return "";
  }

  context.drawImage(image, 0, 0);

  try {
    return snapshotCanvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

// Only the classifications that end up as a filtered SVG replacement (a dark
// transparent icon to invert, a light non-solid image to darken) ever read the
// dataURL, so it is built just for those instead of for every analyzed image.
function shouldBuildDataURL(analysis: ImageAnalysis, image: HTMLImageElement): boolean {
  if (analysis.isLarge) {
    return false;
  }

  if (analysis.isDark && analysis.isTransparent && image.naturalWidth > 2) {
    return true;
  }

  return analysis.isLight && !analysis.isTransparent && !analysis.solidColor;
}

// Bounded because entries can carry a base64 dataURL of the full image — in a
// long-lived mail client an unbounded per-url cache would accumulate megabytes.
const IMAGE_DETAILS_CACHE_MAX_ENTRIES = 256;
const imageDetailsCache = new Map<string, ImageDetails | null>();

function rememberImageDetails(url: string, details: ImageDetails | null) {
  if (imageDetailsCache.size >= IMAGE_DETAILS_CACHE_MAX_ENTRIES) {
    const oldestUrl = imageDetailsCache.keys().next().value;

    if (oldestUrl !== undefined) {
      imageDetailsCache.delete(oldestUrl);
    }
  }

  imageDetailsCache.set(url, details);
}

export async function getImageDetails(url: string): Promise<ImageDetails | null> {
  if (imageDetailsCache.has(url)) {
    const cached = imageDetailsCache.get(url) ?? null;

    imageDetailsCache.delete(url);
    imageDetailsCache.set(url, cached);

    return cached;
  }

  let details: ImageDetails | null = null;

  try {
    const image = await loadImage(url);
    const analysis = analyzeImagePixels(image);

    if (analysis) {
      let dataURL = "";

      if (shouldBuildDataURL(analysis, image)) {
        dataURL = url.startsWith("data:") ? url : imageToDataURL(image);
      }

      details = {
        src: url,
        dataURL,
        width: image.naturalWidth,
        height: image.naturalHeight,
        ...analysis,
      };
    }
  } catch {
    details = null;
  }

  rememberImageDetails(url, details);

  return details;
}

const xmlEscapes: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

function escapeXML(text: string): string {
  return text.replace(/[<>&'"]/g, (character) => xmlEscapes[character] ?? character);
}

export function getFilteredImageURL(details: ImageDetails, theme: Theme): string {
  const href = details.dataURL.startsWith("data:image/svg+xml")
    ? escapeXML(details.dataURL)
    : details.dataURL;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${details.width}" height="${details.height}">` +
    `<defs><filter id="dark-theme-image-filter"><feColorMatrix type="matrix" values="${getSVGFilterMatrixValue(theme)}" /></filter></defs>` +
    `<image width="${details.width}" height="${details.height}" filter="url(#dark-theme-image-filter)" xlink:href="${href}" /></svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function getSolidColorImageURL(details: ImageDetails, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${details.width}" height="${details.height}">` +
    `<rect width="100%" height="100%" fill="${escapeXML(color)}" /></svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const imageUrlRegex = /https?:\/\/[^"')\s]+/g;

// Matches urls directly rather than a `url(...)` wrapper: Gmail serves icons
// through `image-set()`, where the url can appear unwrapped. A pragmatic
// substitute for pixel analysis when the icon is cross-origin (CORS-tainted)
// and so can't be inspected.
export function createInvertImageUrlMatcher(
  invertImageUrls: string[] | undefined,
  invertImageExcludeFilenames: string[] | undefined,
): (cssValue: string) => boolean {
  const excludeFilenameSet = new Set(invertImageExcludeFilenames);

  return (cssValue: string) => {
    if (!invertImageUrls || invertImageUrls.length === 0) {
      return false;
    }

    return [...cssValue.matchAll(imageUrlRegex)].some(([url]) => {
      if (!url || !invertImageUrls.some((prefix) => url.startsWith(prefix))) {
        return false;
      }

      const pathname = url.split(/[?#]/)[0] ?? url;
      const filename = pathname.slice(pathname.lastIndexOf("/") + 1);

      return !excludeFilenameSet.has(filename);
    });
  };
}
