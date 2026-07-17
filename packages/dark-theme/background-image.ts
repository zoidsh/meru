import { isWhitespaceCharCode, replaceColorTokens } from "./css-value";
import {
  getFilteredImageURL,
  getImageDetails,
  getSolidColorImageURL,
  type ImageDetails,
} from "./image";
import { clamp } from "./math";
import { modifyBackgroundColor } from "./modify-colors";
import type { Theme } from "./theme";

const CHAR_CODE_OPEN_PAREN = 40;
const CHAR_CODE_CLOSE_PAREN = 41;
const CHAR_CODE_COMMA = 44;

function splitTopLevelLayers(backgroundImage: string): string[] {
  const layers: string[] = [];
  let parenDepth = 0;
  let layerStart = 0;

  for (let index = 0; index < backgroundImage.length; index++) {
    const charCode = backgroundImage.charCodeAt(index);

    if (charCode === CHAR_CODE_OPEN_PAREN) {
      parenDepth++;
    } else if (charCode === CHAR_CODE_CLOSE_PAREN) {
      parenDepth--;
    } else if (charCode === CHAR_CODE_COMMA && parenDepth === 0) {
      layers.push(backgroundImage.slice(layerStart, index).trim());
      layerStart = index + 1;
    }
  }

  layers.push(backgroundImage.slice(layerStart).trim());

  return layers;
}

const gradientFunctionOpeners = ["linear-gradient(", "radial-gradient(", "conic-gradient("];
const repeatingPrefix = "repeating-";

function isWhitespaceOrCommaCharCode(charCode: number): boolean {
  return charCode === CHAR_CODE_COMMA || isWhitespaceCharCode(charCode);
}

// A gradient function counts only at a layer boundary — the start of the layer
// or right after whitespace/comma — so a url whose path merely contains
// "-gradient(" isn't remapped as one.
function isGradientLayer(layer: string): boolean {
  const layerLowercase = layer.toLowerCase();

  for (const opener of gradientFunctionOpeners) {
    let searchFrom = 0;

    while (true) {
      const openerIndex = layerLowercase.indexOf(opener, searchFrom);

      if (openerIndex === -1) {
        break;
      }

      const functionStart = layerLowercase.startsWith(
        repeatingPrefix,
        openerIndex - repeatingPrefix.length,
      )
        ? openerIndex - repeatingPrefix.length
        : openerIndex;

      if (
        functionStart === 0 ||
        isWhitespaceOrCommaCharCode(layerLowercase.charCodeAt(functionStart - 1))
      ) {
        return true;
      }

      searchFrom = openerIndex + 1;
    }
  }

  return false;
}

// The url a `url(...)` layer points at, with matching outer quotes stripped, or
// null when the layer isn't a url function at all.
function readUrlLayerTarget(layer: string): string | null {
  if (layer.length < 5 || !layer.endsWith(")") || layer.slice(0, 4).toLowerCase() !== "url(") {
    return null;
  }

  const body = layer.slice(4, -1);
  const firstBodyChar = body[0];

  if (
    (firstBodyChar === '"' || firstBodyChar === "'") &&
    body.length >= 2 &&
    body.endsWith(firstBodyChar)
  ) {
    return body.slice(1, -1);
  }

  return body;
}

function buildUrlLayerReplacement(details: ImageDetails, theme: Theme): string | null {
  if (details.isLarge && details.isLight && !details.isTransparent) {
    return "none";
  }

  if (details.isDark && details.isTransparent && details.width > 2) {
    if (!details.dataURL) {
      return null;
    }

    // The extra sepia keeps the inverted icon from going stark blue-white.
    const invertedUrl = getFilteredImageURL(details, {
      ...theme,
      sepia: clamp(theme.sepia + 10, 0, 100),
    });

    return `url("${invertedUrl}")`;
  }

  if (details.isLight && !details.isTransparent) {
    if (details.solidColor) {
      const solidUrl = getSolidColorImageURL(
        details,
        modifyBackgroundColor(details.solidColor, theme),
      );

      return `url("${solidUrl}")`;
    }

    if (!details.dataURL) {
      return null;
    }

    return `url("${getFilteredImageURL(details, theme)}")`;
  }

  return null;
}

export function modifyBackgroundImage(
  element: HTMLElement,
  backgroundImage: string,
  theme: Theme,
  isCancelled: () => boolean,
) {
  const layers = splitTopLevelLayers(backgroundImage);

  // Gradients are remapped synchronously so they apply immediately; url()
  // layers stay as-is until their image has been analyzed asynchronously.
  element.style.setProperty(
    "background-image",
    layers
      .map((layer) => (isGradientLayer(layer) ? replaceColorTokens(layer, theme) : layer))
      .join(", "),
    "important",
  );

  if (!layers.some((layer) => readUrlLayerTarget(layer) != null)) {
    return;
  }

  Promise.all(
    layers.map(async (layer) => {
      const imageUrl = readUrlLayerTarget(layer);

      if (!imageUrl) {
        return isGradientLayer(layer) ? replaceColorTokens(layer, theme) : layer;
      }

      const details = await getImageDetails(imageUrl);

      if (!details) {
        return layer;
      }

      return buildUrlLayerReplacement(details, theme) ?? layer;
    }),
  ).then((finalLayers) => {
    if (isCancelled()) {
      return;
    }

    element.style.setProperty("background-image", finalLayers.join(", "), "important");
  });
}
