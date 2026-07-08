import { parse } from "./color";
import {
  getFilteredImageURL,
  getImageDetails,
  getSolidColorImageURL,
  type ImageDetails,
} from "./image";
import { clamp } from "./math";
import { modifyBackgroundColor } from "./modify-colors";
import type { Theme } from "./theme";

const gradientRegex = /(^|[\s,])(repeating-)?(linear|radial|conic)-gradient\(/i;
const urlLayerRegex = /^url\((['"]?)([^]*?)\1\)$/i;
const colorTokenRegex = /rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]+/gi;

function splitLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];

    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    } else if (char === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  layers.push(value.slice(start).trim());

  return layers;
}

function isGradientLayer(layer: string): boolean {
  return gradientRegex.test(layer);
}

function modifyGradientLayer(layer: string, theme: Theme): string {
  return layer.replace(colorTokenRegex, (token) => {
    const rgb = parse(token);

    return rgb ? modifyBackgroundColor(rgb, theme) : token;
  });
}

// Ported from Dark Reader's getBgImageValue decision tree (dark mode).
function getImageReplacement(details: ImageDetails, theme: Theme): string | null {
  const { isDark, isLight, isTransparent, isLarge, solidColor, width, dataURL } = details;

  if (isLarge && isLight && !isTransparent) {
    return "none";
  }

  if (isDark && isTransparent && width > 2) {
    if (!dataURL) {
      return null;
    }

    const inverted = getFilteredImageURL(details, {
      ...theme,
      sepia: clamp(theme.sepia + 10, 0, 100),
    });

    return `url("${inverted}")`;
  }

  if (isLight && !isTransparent) {
    if (solidColor) {
      const solid = getSolidColorImageURL(details, modifyBackgroundColor(solidColor, theme));

      return `url("${solid}")`;
    }

    if (!dataURL) {
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
  const layers = splitLayers(backgroundImage);

  // Gradients are remapped synchronously so they apply immediately; url()
  // layers stay as-is until their image has been analyzed asynchronously.
  element.style.setProperty(
    "background-image",
    layers
      .map((layer) => (isGradientLayer(layer) ? modifyGradientLayer(layer, theme) : layer))
      .join(", "),
    "important",
  );

  const hasUrlLayer = layers.some((layer) => urlLayerRegex.test(layer));

  if (!hasUrlLayer) {
    return;
  }

  Promise.all(
    layers.map(async (layer) => {
      const urlMatch = layer.match(urlLayerRegex);

      if (!urlMatch) {
        return isGradientLayer(layer) ? modifyGradientLayer(layer, theme) : layer;
      }

      const details = await getImageDetails(urlMatch[2]);

      if (!details) {
        return layer;
      }

      return getImageReplacement(details, theme) ?? layer;
    }),
  ).then((modifiedLayers) => {
    if (isCancelled()) {
      return;
    }

    element.style.setProperty("background-image", modifiedLayers.join(", "), "important");
  });
}
