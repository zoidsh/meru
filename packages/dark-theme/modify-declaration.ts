import { modifyBackgroundImageValue, type BackgroundImageModification } from "./background-image";
import { parseColorWithCache, type RGBA } from "./color";
import { forEachVariableReference, modifyColorTokens, substituteVarFallbacks } from "./css-value";
import { modifyBackgroundColor, modifyBorderColor, modifyForegroundColor } from "./modify-colors";
import type { Theme } from "./theme";

export type DeclarationRoute = "background" | "foreground" | "border" | "shadow" | "image";

const backgroundRouteProperties = new Set(["background", "background-color"]);

const foregroundRouteProperties = new Set([
  "color",
  "fill",
  "stroke",
  "stop-color",
  "caret-color",
  "-webkit-text-fill-color",
  "text-decoration-color",
  "column-rule-color",
]);

const borderRouteProperties = new Set([
  "border",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "outline",
  "outline-color",
]);

const shadowRouteProperties = new Set(["box-shadow", "text-shadow"]);

const imageRouteProperties = new Set(["background-image", "list-style-image"]);

export function getDeclarationRoute(property: string): DeclarationRoute | null {
  if (backgroundRouteProperties.has(property)) {
    return "background";
  }

  if (foregroundRouteProperties.has(property)) {
    return "foreground";
  }

  if (borderRouteProperties.has(property)) {
    return "border";
  }

  if (shadowRouteProperties.has(property)) {
    return "shadow";
  }

  if (imageRouteProperties.has(property)) {
    return "image";
  }

  return null;
}

// Values that carry no concrete color — nothing to darken, and overriding them
// would only pin cascade keywords the page relies on.
const passthroughValues = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "auto",
  "none",
  "transparent",
  "currentcolor",
]);

// Fully transparent tokens are left as-is so a declaration whose only color is
// `rgba(0, 0, 0, 0)` produces no override — otherwise every default-transparent
// longhand in the document would emit a useless declaration.
const keepTransparent = (modify: (rgb: RGBA) => string) => (rgb: RGBA) =>
  rgb.a === 0 ? null : modify(rgb);

function hasVisibleColorToken(value: string): boolean {
  let hasVisibleToken = false;

  modifyColorTokens(value, (rgb) => {
    if (rgb.a !== 0) {
      hasVisibleToken = true;
    }

    return null;
  });

  return hasVisibleToken;
}

export type DeclarationDarkeningContext = {
  theme: Theme;
  // Whether a custom property's dark re-declaration is being emitted, so a
  // `var(--x, fallback)` consuming it can be trusted to resolve dark. Unknown
  // variables get their fallbacks pinned instead — the variable's runtime value
  // is out of reach (inline styles or constructed stylesheets no stylesheet
  // walk can see), so trusting it could leak a light color.
  isVariableDarkened: (variableName: string) => boolean;
  isCancelled: () => boolean;
};

export type DarkenedDeclaration = {
  property: string;
  value: string | BackgroundImageModification;
  important: boolean;
};

export function getDarkenedDeclaration(
  property: string,
  value: string,
  important: boolean,
  context: DeclarationDarkeningContext,
): DarkenedDeclaration | null {
  const route = getDeclarationRoute(property);

  if (!route) {
    return null;
  }

  const sourceValue = value.trim();

  if (sourceValue === "" || passthroughValues.has(sourceValue.toLowerCase())) {
    return null;
  }

  let workingValue = sourceValue;
  let hasPinnedFallbacks = false;

  if (sourceValue.includes("var(")) {
    let hasUnknownVariable = false;

    forEachVariableReference(sourceValue, (variableName) => {
      if (!context.isVariableDarkened(variableName)) {
        hasUnknownVariable = true;
      }
    });

    if (hasUnknownVariable) {
      workingValue = substituteVarFallbacks(sourceValue);
      hasPinnedFallbacks = true;
    }
  }

  if (route === "image") {
    const modification = modifyBackgroundImageValue(
      workingValue,
      context.theme,
      context.isCancelled,
    );

    if (modification.immediateValue === sourceValue && !modification.finalValuePromise) {
      return null;
    }

    return { property, value: modification, important };
  }

  const modifyRouteColor =
    route === "foreground"
      ? modifyForegroundColor
      : route === "border"
        ? modifyBorderColor
        : modifyBackgroundColor;

  // Author CSS keeps keyword colors verbatim (`white`, `ButtonFace`) and may use
  // modern functions the token scanner doesn't recognize (`oklch()`,
  // `color-mix()`), so a value that parses as a single color is darkened whole.
  // Keyword colors embedded in compound values (`1px solid white`) still slip
  // through the scanner — an accepted miss.
  const wholeValueColor = parseColorWithCache(workingValue);

  const darkenedValue =
    wholeValueColor != null
      ? wholeValueColor.a === 0
        ? workingValue
        : modifyRouteColor(wholeValueColor, context.theme)
      : modifyColorTokens(
          workingValue,
          keepTransparent((rgb) => modifyRouteColor(rgb, context.theme)),
        );

  if (darkenedValue === sourceValue) {
    return null;
  }

  if (hasPinnedFallbacks && darkenedValue === workingValue && !hasVisibleColorToken(workingValue)) {
    return null;
  }

  return { property, value: darkenedValue, important };
}

const tilingBackgroundRepeatValues = new Set(["repeat", "repeat-x", "repeat-y", "space", "round"]);

// A blank invert(1) is only safe on a background drawn once at natural size —
// a tiled or stretched image is a texture, not an icon, and inverting it would
// recolour a whole surface. Undeclared repeat/size don't veto: Gmail's icon
// rules typically declare neither, and vetoing on the CSS defaults would turn
// the invert path off entirely.
export function isSafeToInvert(
  backgroundRepeat: string | undefined,
  backgroundSize: string | undefined,
): boolean {
  if (backgroundRepeat) {
    const repeatTokens = backgroundRepeat.toLowerCase().split(/[\s,]+/);

    if (repeatTokens.some((repeatToken) => tilingBackgroundRepeatValues.has(repeatToken))) {
      return false;
    }
  }

  if (backgroundSize) {
    const backgroundSizeLowercase = backgroundSize.toLowerCase();

    if (
      backgroundSizeLowercase.includes("cover") ||
      backgroundSizeLowercase.includes("contain") ||
      backgroundSizeLowercase.includes("100%")
    ) {
      return false;
    }
  }

  return true;
}
