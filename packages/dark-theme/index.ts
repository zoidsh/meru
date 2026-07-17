import { coversProperty, type IgnorePropertyRule } from "./ignore";
import { createInvertImageUrlMatcher } from "./image";
import { buildInlineOverrideStyleText, createInlinePass } from "./inline-pass";
import { attachSheetEngine, ROOT_ATTRIBUTE } from "./sheet-engine";
import { INJECTED_STYLE_ATTRIBUTE } from "./stylesheets";
import { DEFAULT_THEME, type Theme } from "./theme";

export { DEFAULT_THEME } from "./theme";
export type { Theme } from "./theme";
export type { IgnorePropertyRule } from "./ignore";
export {
  clearColorModificationCache,
  modifyBackgroundColor,
  modifyBorderColor,
  modifyForegroundColor,
} from "./modify-colors";

export type DarkThemeOptions = Partial<Theme> & {
  // Opt elements out of theming. A string selector keeps its matching elements and
  // their descendants (via closest) fully original — e.g. coloured chips or badges. An
  // object skips only the listed properties on elements matching its selector (via
  // matches), leaving those to CSS — e.g. a border colour set in a stylesheet, which the
  // engine's override would otherwise win over.
  ignore?: Array<string | IgnorePropertyRule>;
  // Watch the subtree and keep theming content added later. Defaults to true;
  // when enabled, call the returned controller's revert() to disconnect.
  observe?: boolean;
  // CSS injected into the document while the theme is active and removed on
  // revert()/destroy(). Use for hand-tuned overrides — injected after the
  // generated sheets and given extra specificity by the [data-dark-theme]
  // attribute, so its rules win over the generated values.
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
  // Undo theming on a still-live subtree: disconnect the observers, remove the
  // generated stylesheets, restore every touched style attribute, and release
  // references.
  revert: () => void;
  // Tear down without restoring attributes: disconnect the observers, remove
  // the generated stylesheets, and release references. Use when the themed
  // subtree is being discarded (e.g. removed from the DOM), where restoring
  // attributes would be wasted work.
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

  const ignoreSelectors = (ignore ?? []).filter(
    (entry): entry is string => typeof entry === "string",
  );
  const ignorePropertyRules = (ignore ?? []).filter(
    (entry): entry is IgnorePropertyRule => typeof entry === "object",
  );

  const matchesInvertImageUrl = createInvertImageUrlMatcher(
    invertImageUrls,
    invertImageExcludeFilenames,
  );

  const engineInstance = attachSheetEngine({
    root,
    theme,
    ignoreSelectors,
    ignorePropertyRules,
    matchesInvertImageUrl,
  });

  root.setAttribute(ROOT_ATTRIBUTE, engineInstance.rootAttributeValue);

  const injectedStyleElements: HTMLStyleElement[] = [];

  const injectStyle = (styleText: string) => {
    const styleElement = root.ownerDocument.createElement("style");
    styleElement.setAttribute(INJECTED_STYLE_ATTRIBUTE, "");
    styleElement.textContent = styleText;
    root.ownerDocument.head?.appendChild(styleElement);
    injectedStyleElements.push(styleElement);
  };

  injectStyle(buildInlineOverrideStyleText(theme));

  const inlinePass = createInlinePass({
    root,
    theme,
    observe,
    ignoreSelector: ignoreSelectors.length > 0 ? ignoreSelectors.join(", ") : null,
    isPropertyIgnored: (element, property) =>
      ignorePropertyRules.some(
        (ignoreRule) =>
          coversProperty(ignoreRule.properties, property) && element.matches(ignoreRule.selector),
      ),
    matchesInvertImageUrl,
    onSubtreeMutated: () => {
      engineInstance.refresh();
    },
    onStyleElementAdded: () => {
      engineInstance.notifyStylesChanged();
    },
  });

  // Injected after the generated sheets so a hand-tuned override there wins
  // over the generated values.
  if (css) {
    injectStyle(css);
  }

  const teardown = () => {
    inlinePass.disconnect();
    engineInstance.detach();
    root.removeAttribute(ROOT_ATTRIBUTE);

    for (const styleElement of injectedStyleElements) {
      styleElement.remove();
    }
  };

  return {
    revert: () => {
      teardown();
      inlinePass.restore();
    },
    destroy: () => {
      teardown();
      inlinePass.release();
    },
  };
}
