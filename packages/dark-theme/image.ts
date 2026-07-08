/*
 * Image analysis and SVG filtering ported from Dark Reader
 * (https://github.com/darkreader/darkreader), MIT License,
 * Copyright (c) 2018-present Dark Reader Ltd.
 * Dark Reader's extension-only background fetch and blob-URL machinery is
 * replaced with a plain cross-origin canvas load that degrades to "leave the
 * image untouched" whenever the pixels cannot be read (e.g. a tainted canvas);
 * the classification thresholds and SVG construction are unchanged.
 */

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

const MAX_ANALYSIS_PIXELS_COUNT = 32 * 32;
const LARGE_IMAGE_PIXELS_COUNT = 512 * 512;

let analysisCanvas: HTMLCanvasElement | null = null;
let analysisContext: CanvasRenderingContext2D | null = null;

function getAnalysisContext() {
  if (!analysisContext) {
    analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = MAX_ANALYSIS_PIXELS_COUNT;
    analysisCanvas.height = MAX_ANALYSIS_PIXELS_COUNT;
    analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });

    if (analysisContext) {
      analysisContext.imageSmoothingEnabled = false;
    }
  }

  return analysisContext;
}

type ImageAnalysis = Omit<ImageDetails, "src" | "dataURL" | "width" | "height">;

function analyzeImage(image: HTMLImageElement): ImageAnalysis | null {
  const context = getAnalysisContext();
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (!context || sourceWidth === 0 || sourceHeight === 0) {
    return null;
  }

  const isLarge = sourceWidth * sourceHeight > LARGE_IMAGE_PIXELS_COUNT;

  const scaleFactor = Math.min(
    1,
    Math.sqrt(MAX_ANALYSIS_PIXELS_COUNT / (sourceWidth * sourceHeight)),
  );
  const width = Math.ceil(sourceWidth * scaleFactor);
  const height = Math.ceil(sourceHeight * scaleFactor);

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);

  let pixels: Uint8ClampedArray;

  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return null;
  }

  const TRANSPARENT_ALPHA_THRESHOLD = 0.05;
  const DARK_LIGHTNESS_THRESHOLD = 0.4;
  const LIGHT_LIGHTNESS_THRESHOLD = 0.7;

  let transparentPixelsCount = 0;
  let darkPixelsCount = 0;
  let lightPixelsCount = 0;

  let minLightness = 1;
  let maxLightness = 0;
  let sumRed = 0;
  let sumGreen = 0;
  let sumBlue = 0;
  let sumAlpha = 0;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const alpha = pixels[offset + 3] ?? 0;

    sumRed += red;
    sumGreen += green;
    sumBlue += blue;
    sumAlpha += alpha;

    if (alpha / 255 < TRANSPARENT_ALPHA_THRESHOLD) {
      transparentPixelsCount++;
    } else {
      const lightness = getSRGBLightness(red, green, blue);

      if (lightness < DARK_LIGHTNESS_THRESHOLD) {
        darkPixelsCount++;
      }

      if (lightness > LIGHT_LIGHTNESS_THRESHOLD) {
        lightPixelsCount++;
      }

      if (lightness < minLightness) {
        minLightness = lightness;
      }

      if (lightness > maxLightness) {
        maxLightness = lightness;
      }
    }
  }

  const totalPixelsCount = width * height;
  const opaquePixelsCount = totalPixelsCount - transparentPixelsCount;

  const DARK_IMAGE_THRESHOLD = 0.7;
  const LIGHT_IMAGE_THRESHOLD = 0.7;
  const TRANSPARENT_IMAGE_THRESHOLD = 0.1;
  const SOLID_LIGHTNESS_DIFF_THRESHOLD = 0.1;

  const isSolid =
    sumAlpha === totalPixelsCount * 255 &&
    maxLightness - minLightness < SOLID_LIGHTNESS_DIFF_THRESHOLD;
  const solidColor =
    isSolid && opaquePixelsCount > 0
      ? {
          r: Math.round(sumRed / opaquePixelsCount),
          g: Math.round(sumGreen / opaquePixelsCount),
          b: Math.round(sumBlue / opaquePixelsCount),
          a: transparentPixelsCount / totalPixelsCount,
        }
      : null;

  return {
    isDark: opaquePixelsCount > 0 && darkPixelsCount / opaquePixelsCount >= DARK_IMAGE_THRESHOLD,
    isLight: opaquePixelsCount > 0 && lightPixelsCount / opaquePixelsCount >= LIGHT_IMAGE_THRESHOLD,
    isTransparent: transparentPixelsCount / totalPixelsCount >= TRANSPARENT_IMAGE_THRESHOLD,
    isLarge,
    solidColor,
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

let fullSizeCanvas: HTMLCanvasElement | null = null;

function imageToDataURL(image: HTMLImageElement): string {
  if (!fullSizeCanvas) {
    fullSizeCanvas = document.createElement("canvas");
  }

  fullSizeCanvas.width = image.naturalWidth;
  fullSizeCanvas.height = image.naturalHeight;

  const context = fullSizeCanvas.getContext("2d");

  if (!context) {
    return "";
  }

  context.drawImage(image, 0, 0);

  try {
    return fullSizeCanvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

const imageDetailsCache = new Map<string, ImageDetails | null>();

export async function getImageDetails(url: string): Promise<ImageDetails | null> {
  const cached = imageDetailsCache.get(url);

  if (cached !== undefined) {
    return cached;
  }

  let details: ImageDetails | null = null;

  try {
    const image = await loadImage(url);
    const analysis = analyzeImage(image);

    if (analysis) {
      const dataURL = analysis.isLarge ? "" : url.startsWith("data:") ? url : imageToDataURL(image);

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

  imageDetailsCache.set(url, details);

  return details;
}

const xmlEscapeChars: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

function escapeXML(text: string): string {
  return text.replace(/[<>&'"]/g, (char) => xmlEscapeChars[char] ?? char);
}

export function getFilteredImageURL(details: ImageDetails, theme: Theme): string {
  const href = details.dataURL.startsWith("data:image/svg+xml")
    ? escapeXML(details.dataURL)
    : details.dataURL;
  const matrix = getSVGFilterMatrixValue(theme);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${details.width}" height="${details.height}">`,
    "<defs>",
    '<filter id="dark-theme-image-filter">',
    `<feColorMatrix type="matrix" values="${matrix}" />`,
    "</filter>",
    "</defs>",
    `<image width="${details.width}" height="${details.height}" filter="url(#dark-theme-image-filter)" xlink:href="${href}" />`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function getSolidColorImageURL(details: ImageDetails, color: string): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${details.width}" height="${details.height}">`,
    `<rect width="100%" height="100%" fill="${escapeXML(color)}" />`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
