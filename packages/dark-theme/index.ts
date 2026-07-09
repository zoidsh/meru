import { modifyBackgroundImage } from "./background-image";
import { parse } from "./color";
import { replaceColorTokens } from "./css-value";
import { getCSSFilterValue } from "./filter";
import { getImageDetails } from "./image";
import { modifyBackgroundColor, modifyBorderColor, modifyForegroundColor } from "./modify-colors";
import { buildDarkStateOverrides } from "./state-rules";
import { DEFAULT_THEME, type Theme } from "./theme";
import { buildDarkVariableOverrides } from "./variables";

export { DEFAULT_THEME } from "./theme";
export type { Theme } from "./theme";
export {
  clearColorModificationCache,
  modifyBackgroundColor,
  modifyBorderColor,
  modifyForegroundColor,
} from "./modify-colors";

const PROCESSED_ATTRIBUTE = "data-dark-theme";
const PSEUDO_ATTRIBUTE = "data-dark-theme-pseudo";
const ROOT_ATTRIBUTE = "data-dark-theme-root";
const borderSides = ["top", "right", "bottom", "left"] as const;
const pseudoSelectors = ["::before", "::after"] as const;
const svgColorProperties = ["fill", "stroke", "stop-color"] as const;

// Distinguishes each active theme's root so its @scope-wrapped state rules apply
// only within its own subtree, even with several themed subtrees on one page.
let instanceCounter = 0;

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
  pseudos: Array<{ selector: (typeof pseudoSelectors)[number]; body: string }>;
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
  // CSS injected into the document while the theme is active and removed on
  // revert()/destroy(). Use for rules the inline-override engine can't reach —
  // e.g. :hover backgrounds or ::before icons — scoped with [data-dark-theme].
  css?: string;
  // URL prefixes of dark monochrome icons (element background-images, or a
  // pseudo-element's content/background-image) to blank-invert with
  // `filter: invert(1)`. A pragmatic substitute for pixel analysis when the icon
  // is cross-origin (CORS-tainted) and so can't be inspected — e.g. a site's
  // material-icon CDN path. Matched by `startsWith`.
  invertImageUrls?: string[];
  // Filenames (the last path segment of the url) that `invertImageUrls` should
  // skip even when their prefix matches — e.g. a coloured icon variant sharing the
  // same CDN path as the monochrome ones, which inverting would wrongly recolour.
  invertImageExcludeFilenames?: string[];
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
  const {
    ignore,
    observe = true,
    css,
    invertImageUrls,
    invertImageExcludeFilenames,
    ...themeOptions
  } = options ?? {};
  const theme = { ...DEFAULT_THEME, ...themeOptions };

  let cancelled = false;
  const isCancelled = () => cancelled;

  const ignoreSelector = ignore && ignore.length > 0 ? ignore.join(",") : null;
  const isIgnored = (element: HTMLElement) =>
    ignoreSelector != null && element.closest(ignoreSelector) != null;

  const invertImageExcludeFilenameSet = new Set(invertImageExcludeFilenames);

  const hasInvertImageUrl = (cssValue: string) => {
    if (!invertImageUrls || invertImageUrls.length === 0) {
      return false;
    }

    // Match the url directly rather than a `url(...)` wrapper: Gmail serves icons
    // through `image-set()`, where the url can appear unwrapped.
    return [...cssValue.matchAll(/https?:\/\/[^"')\s]+/g)].some(([url]) => {
      if (!url || !invertImageUrls.some((prefix) => url.startsWith(prefix))) {
        return false;
      }

      const pathname = url.split(/[?#]/)[0] ?? url;
      const filename = pathname.slice(pathname.lastIndexOf("/") + 1);

      return !invertImageExcludeFilenameSet.has(filename);
    });
  };

  // Which properties this engine has overridden on each element, so re-theming
  // (on class changes) only fills in newly-appeared properties instead of
  // re-darkening its own output or touching the element's own inline styles.
  const overriddenProperties = new WeakMap<HTMLElement, Set<string>>();
  const originalStyles = new Map<HTMLElement, string>();

  const injectedStyleElements: HTMLStyleElement[] = [];

  const injectStyle = (styleText: string) => {
    const styleElement = root.ownerDocument.createElement("style");
    styleElement.textContent = styleText;
    root.ownerDocument.head?.appendChild(styleElement);
    injectedStyleElements.push(styleElement);
  };

  // Pseudo-elements can't be reached by inline styles, so their darkened paint is
  // collected into one injected stylesheet, each rule keyed to a unique attribute
  // stamped on the owning element.
  const pseudoRules: string[] = [];
  let pseudoRuleCounter = 0;
  let pseudoStyleElement: HTMLStyleElement | null = null;

  const setOverride = (element: HTMLElement, property: string, value: string) => {
    let properties = overriddenProperties.get(element);

    if (!properties) {
      properties = new Set();
      overriddenProperties.set(element, properties);
    }

    if (properties.has(property)) {
      return false;
    }

    element.style.setProperty(property, value, "important");
    properties.add(property);

    return true;
  };

  // A ::before/::after box paints backgrounds, borders and shadows that don't
  // inherit from the element, so — unlike the pseudo's `color`, already covered by
  // the element's inline color — they leak light and must be darkened directly.
  // A content/background image can't be color-inspected when it's cross-origin
  // (CORS), so a dark monochrome icon matching `invertImageUrls` is blank-inverted.
  const capturePseudoRules = (element: HTMLElement) => {
    const pseudos: ColorSnapshot["pseudos"] = [];

    for (const selector of pseudoSelectors) {
      const pseudoStyle = window.getComputedStyle(element, selector);
      const content = pseudoStyle.getPropertyValue("content");

      if (content === "none" || content === "normal") {
        continue;
      }

      const declarations: string[] = [];

      if (hasInvertImageUrl(content) || hasInvertImageUrl(pseudoStyle.backgroundImage)) {
        declarations.push("filter: invert(1) !important");
      }

      const backgroundColor = parse(pseudoStyle.backgroundColor);

      if (backgroundColor != null && backgroundColor.a !== 0) {
        declarations.push(
          `background-color: ${modifyBackgroundColor(backgroundColor, theme)} !important`,
        );
      }

      const backgroundImage = pseudoStyle.backgroundImage;

      if (backgroundImage && backgroundImage !== "none" && !backgroundImage.includes("url(")) {
        declarations.push(
          `background-image: ${replaceColorTokens(backgroundImage, theme)} !important`,
        );
      }

      for (const side of borderSides) {
        const width = parseFloat(pseudoStyle.getPropertyValue(`border-${side}-width`));
        const borderStyle = pseudoStyle.getPropertyValue(`border-${side}-style`);

        if (width > 0 && borderStyle !== "none") {
          const color = parse(pseudoStyle.getPropertyValue(`border-${side}-color`));

          if (color != null && color.a !== 0) {
            declarations.push(
              `border-${side}-color: ${modifyBorderColor(color, theme)} !important`,
            );
          }
        }
      }

      const boxShadow = pseudoStyle.getPropertyValue("box-shadow");

      if (boxShadow && boxShadow !== "none") {
        declarations.push(`box-shadow: ${replaceColorTokens(boxShadow, theme)} !important`);
      }

      if (declarations.length > 0) {
        pseudos.push({ selector, body: declarations.join("; ") });
      }
    }

    return pseudos;
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
      pseudos: capturePseudoRules(element),
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
      if (hasInvertImageUrl(snapshot.backgroundImage)) {
        setOverride(snapshot.element, "filter", "invert(1)");
      } else {
        modifyBackgroundImage(snapshot.element, snapshot.backgroundImage, theme, isCancelled);
      }
    }

    if (snapshot.element instanceof HTMLImageElement) {
      invertDarkImageElement(snapshot.element, theme, isCancelled);
    }
  };

  const applyPseudoRules = (snapshot: ColorSnapshot) => {
    if (snapshot.pseudos.length === 0) {
      return;
    }

    const id = String(pseudoRuleCounter++);
    snapshot.element.setAttribute(PSEUDO_ATTRIBUTE, id);

    for (const { selector, body } of snapshot.pseudos) {
      pseudoRules.push(`[${PSEUDO_ATTRIBUTE}="${id}"]${selector} { ${body}; }`);
    }

    if (!pseudoStyleElement) {
      pseudoStyleElement = root.ownerDocument.createElement("style");
      root.ownerDocument.head?.appendChild(pseudoStyleElement);
      injectedStyleElements.push(pseudoStyleElement);
    }

    pseudoStyleElement.textContent = pseudoRules.join("\n");
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
      applyPseudoRules(snapshot);
    }
  };

  const refreshElement = (element: HTMLElement) => {
    if (!element.hasAttribute(PROCESSED_ATTRIBUTE) || isIgnored(element)) {
      return;
    }

    applyColors(captureSnapshot(element));
  };

  processBatch([root, ...root.querySelectorAll<HTMLElement>("*")]);

  const rootId = String(instanceCounter++);
  root.setAttribute(ROOT_ATTRIBUTE, rootId);

  // Injected before the caller's css so a hand-tuned override there wins over the
  // generated values (equal specificity/importance, later wins).
  const variableOverrides = buildDarkVariableOverrides(root, theme);

  if (variableOverrides) {
    injectStyle(variableOverrides);
  }

  const stateOverrides = buildDarkStateOverrides(
    root.ownerDocument,
    theme,
    `[${ROOT_ATTRIBUTE}="${rootId}"]`,
  );

  if (stateOverrides) {
    injectStyle(stateOverrides);
  }

  if (css) {
    injectStyle(css);
  }

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

  const teardown = () => {
    cancelled = true;
    observer?.disconnect();
    root.removeAttribute(ROOT_ATTRIBUTE);

    for (const styleElement of injectedStyleElements) {
      styleElement.remove();
    }
  };

  return {
    revert: () => {
      teardown();

      for (const [element, originalStyle] of originalStyles) {
        element.style.cssText = originalStyle;
        element.removeAttribute(PROCESSED_ATTRIBUTE);
        element.removeAttribute(PSEUDO_ATTRIBUTE);
      }

      originalStyles.clear();
    },
    destroy: () => {
      teardown();
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
