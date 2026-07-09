import { modifyBackgroundImage } from "./background-image";
import { parse } from "./color";
import { replaceColorTokens } from "./css-value";
import { getCSSFilterValue } from "./filter";
import { getImageDetails } from "./image";
import { modifyBackgroundColor, modifyBorderColor, modifyForegroundColor } from "./modify-colors";
import { DEFAULT_THEME, type Theme } from "./theme";

export { DEFAULT_THEME } from "./theme";
export type { Theme } from "./theme";
export {
  clearColorModificationCache,
  modifyBackgroundColor,
  modifyBorderColor,
  modifyForegroundColor,
} from "./modify-colors";

const PROCESSED_ATTRIBUTE = "data-dark-theme";
const borderSides = ["top", "right", "bottom", "left"] as const;
const svgColorProperties = ["fill", "stroke", "stop-color"] as const;

type ParsedColor = ReturnType<typeof parse>;

type ColorSnapshot = {
  element: HTMLElement;
  originalStyle: string;
  backgroundColor: ParsedColor;
  backgroundImage: string;
  textColor: ParsedColor;
  borderColors: Array<{ side: (typeof borderSides)[number]; color: ParsedColor }>;
  outlineColor: ParsedColor;
  foregroundColors: Array<{ property: string; color: ParsedColor }>;
  boxShadow: string;
  textShadow: string;
};

export type DarkThemeOptions = Partial<Theme> & {
  // Selectors whose matching elements (and their descendants) keep their
  // original colors instead of being themed (e.g. coloured chips or badges).
  ignore?: string[];
  // Watch the subtree and keep theming content added later, and re-theme an
  // element when its class changes so state-driven styles (e.g. the shadow a
  // sticky toolbar gains on scroll) are darkened too. Defaults to true; when
  // enabled, call the returned controller's revert() to disconnect the observer.
  observe?: boolean;
};

export type DarkThemeController = {
  // Undo theming on a still-live subtree: disconnect the observer, restore every
  // element's original inline styles, and release references.
  revert: () => void;
  // Tear down without restoring styles: disconnect the observer and release
  // references. Use when the themed subtree is being discarded (e.g. removed from
  // the DOM), where restoring inline styles would be wasted work.
  destroy: () => void;
};

export function applyDarkTheme(root: HTMLElement, options?: DarkThemeOptions): DarkThemeController {
  const { ignore, observe = true, ...themeOptions } = options ?? {};
  const theme = { ...DEFAULT_THEME, ...themeOptions };

  let cancelled = false;
  const isCancelled = () => cancelled;

  const ignoreSelector = ignore && ignore.length > 0 ? ignore.join(",") : null;
  const isIgnored = (element: HTMLElement) =>
    ignoreSelector != null && element.closest(ignoreSelector) != null;

  // Which properties this engine has overridden on each element, so re-theming
  // (on class changes) only fills in newly-appeared properties instead of
  // re-darkening its own output or touching the element's own inline styles.
  const overriddenProperties = new WeakMap<HTMLElement, Set<string>>();
  const originalStyles = new Map<HTMLElement, string>();

  const setOverride = (element: HTMLElement, property: string, value: string) => {
    let properties = overriddenProperties.get(element);

    if (!properties) {
      properties = new Set();
      overriddenProperties.set(element, properties);
    }

    if (properties.has(property)) {
      return;
    }

    element.style.setProperty(property, value, "important");
    properties.add(property);
  };

  const captureSnapshot = (element: HTMLElement): ColorSnapshot => {
    const computedStyle = window.getComputedStyle(element);

    const borderColors = borderSides
      .filter((side) => {
        const width = parseFloat(computedStyle.getPropertyValue(`border-${side}-width`));
        const style = computedStyle.getPropertyValue(`border-${side}-style`);

        return width > 0 && style !== "none";
      })
      .map((side) => ({
        side,
        color: parse(computedStyle.getPropertyValue(`border-${side}-color`)),
      }));

    const outlineColor =
      computedStyle.getPropertyValue("outline-style") !== "none" &&
      parseFloat(computedStyle.getPropertyValue("outline-width")) > 0
        ? parse(computedStyle.getPropertyValue("outline-color"))
        : null;

    const foregroundColors: Array<{ property: string; color: ParsedColor }> = [];

    const captureForegroundColor = (property: string) => {
      foregroundColors.push({ property, color: parse(computedStyle.getPropertyValue(property)) });
    };

    if (element instanceof SVGElement) {
      for (const property of svgColorProperties) {
        captureForegroundColor(property);
      }
    }

    if (computedStyle.getPropertyValue("text-decoration-line") !== "none") {
      captureForegroundColor("text-decoration-color");
    }

    if (
      computedStyle.getPropertyValue("column-rule-style") !== "none" &&
      parseFloat(computedStyle.getPropertyValue("column-rule-width")) > 0
    ) {
      captureForegroundColor("column-rule-color");
    }

    // -webkit-text-fill-color is inherited and overrides `color` for glyph fill,
    // so only theme it when an element sets it to something other than its own
    // color; otherwise the redundant value would leak onto descendants.
    if (computedStyle.getPropertyValue("-webkit-text-fill-color") !== computedStyle.color) {
      captureForegroundColor("-webkit-text-fill-color");
    }

    captureForegroundColor("caret-color");

    return {
      element,
      originalStyle: element.style.cssText,
      backgroundColor: parse(computedStyle.backgroundColor),
      backgroundImage: computedStyle.backgroundImage,
      textColor: parse(computedStyle.color),
      borderColors,
      outlineColor,
      foregroundColors,
      boxShadow: computedStyle.getPropertyValue("box-shadow"),
      textShadow: computedStyle.getPropertyValue("text-shadow"),
    };
  };

  const applyColors = (snapshot: ColorSnapshot) => {
    const { element, backgroundColor, textColor, borderColors, outlineColor, foregroundColors } =
      snapshot;

    const hasBackground = backgroundColor != null && backgroundColor.a !== 0;

    if (element === root && !hasBackground) {
      setOverride(element, "background-color", theme.darkSchemeBackgroundColor);
    } else if (hasBackground) {
      setOverride(element, "background-color", modifyBackgroundColor(backgroundColor, theme));
    }

    if (textColor != null && textColor.a !== 0) {
      setOverride(element, "color", modifyForegroundColor(textColor, theme));
    }

    for (const { side, color } of borderColors) {
      if (color != null && color.a !== 0) {
        setOverride(element, `border-${side}-color`, modifyBorderColor(color, theme));
      }
    }

    if (outlineColor != null && outlineColor.a !== 0) {
      setOverride(element, "outline-color", modifyBorderColor(outlineColor, theme));
    }

    for (const { property, color } of foregroundColors) {
      if (color != null && color.a !== 0) {
        setOverride(element, property, modifyForegroundColor(color, theme));
      }
    }

    if (snapshot.boxShadow && snapshot.boxShadow !== "none") {
      setOverride(element, "box-shadow", replaceColorTokens(snapshot.boxShadow, theme));
    }

    if (snapshot.textShadow && snapshot.textShadow !== "none") {
      setOverride(element, "text-shadow", replaceColorTokens(snapshot.textShadow, theme));
    }
  };

  const applyImages = (snapshot: ColorSnapshot) => {
    if (snapshot.backgroundImage && snapshot.backgroundImage !== "none") {
      modifyBackgroundImage(snapshot.element, snapshot.backgroundImage, theme, isCancelled);
    }

    if (snapshot.element instanceof HTMLImageElement) {
      invertDarkImageElement(snapshot.element, theme, isCancelled);
    }
  };

  // Colors are read for the whole batch before any are written: applying an
  // inline color to a parent changes what getComputedStyle reports for its
  // children, so a single read-then-write pass would re-modify already-darkened
  // inherited colors.
  const processBatch = (candidates: HTMLElement[]) => {
    const targets = candidates.filter(
      (element) => !element.hasAttribute(PROCESSED_ATTRIBUTE) && !isIgnored(element),
    );

    if (targets.length === 0) {
      return;
    }

    const snapshots = targets.map(captureSnapshot);

    for (const snapshot of snapshots) {
      originalStyles.set(snapshot.element, snapshot.originalStyle);
      applyColors(snapshot);
      snapshot.element.setAttribute(PROCESSED_ATTRIBUTE, "");
    }

    for (const snapshot of snapshots) {
      applyImages(snapshot);
    }
  };

  const refreshElement = (element: HTMLElement) => {
    if (!element.hasAttribute(PROCESSED_ATTRIBUTE) || isIgnored(element)) {
      return;
    }

    applyColors(captureSnapshot(element));
  };

  processBatch([root, ...root.querySelectorAll<HTMLElement>("*")]);

  let observer: MutationObserver | null = null;

  if (observe) {
    observer = new MutationObserver((mutations) => {
      if (cancelled) {
        return;
      }

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              processBatch([node, ...node.querySelectorAll<HTMLElement>("*")]);
            }
          }
        } else if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
          refreshElement(mutation.target);
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  const stopObserving = () => {
    cancelled = true;
    observer?.disconnect();
  };

  return {
    revert: () => {
      stopObserving();

      for (const [element, originalStyle] of originalStyles) {
        element.style.cssText = originalStyle;
        element.removeAttribute(PROCESSED_ATTRIBUTE);
      }

      originalStyles.clear();
    },
    destroy: () => {
      stopObserving();
      originalStyles.clear();
    },
  };
}

// A dark, mostly-transparent <img> (a logo or icon) would vanish against the
// dark background, so it is inverted. Photos and colorful images fall outside
// the dark-and-transparent classification and are left untouched.
function invertDarkImageElement(image: HTMLImageElement, theme: Theme, isCancelled: () => boolean) {
  const source = image.currentSrc || image.src;

  if (!source) {
    return;
  }

  getImageDetails(source).then((details) => {
    if (isCancelled() || !details) {
      return;
    }

    if (details.isDark && details.isTransparent && details.width > 2) {
      image.style.setProperty("filter", getCSSFilterValue(theme), "important");
    }
  });
}
