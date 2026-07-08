import { modifyBackgroundImage } from "./background-image";
import { parse } from "./color";
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

type ColorSnapshot = {
  element: HTMLElement;
  originalStyle: string;
  backgroundColor: ReturnType<typeof parse>;
  backgroundImage: string;
  textColor: ReturnType<typeof parse>;
  borderColors: Array<{ side: (typeof borderSides)[number]; color: ReturnType<typeof parse> }>;
};

export type DarkThemeController = {
  revert: () => void;
};

export function darkTheme(root: HTMLElement, options?: Partial<Theme>): DarkThemeController {
  const theme = { ...DEFAULT_THEME, ...options };

  let cancelled = false;
  const isCancelled = () => cancelled;

  const elements = [root, ...root.querySelectorAll<HTMLElement>("*")].filter(
    (element) => !element.hasAttribute(PROCESSED_ATTRIBUTE),
  );

  // Read every original color before mutating anything: applying an inline color
  // to a parent changes what getComputedStyle reports for its children, so a
  // single read-then-write pass would re-modify already-darkened inherited colors.
  const snapshots: ColorSnapshot[] = elements.map((element) => {
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

    return {
      element,
      originalStyle: element.style.cssText,
      backgroundColor: parse(computedStyle.backgroundColor),
      backgroundImage: computedStyle.backgroundImage,
      textColor: parse(computedStyle.color),
      borderColors,
    };
  });

  for (const snapshot of snapshots) {
    const { element, backgroundColor, textColor, borderColors } = snapshot;

    const isRoot = element === root;
    const hasBackground = backgroundColor != null && backgroundColor.a !== 0;

    if (isRoot && !hasBackground) {
      element.style.setProperty("background-color", theme.darkSchemeBackgroundColor, "important");
    } else if (hasBackground) {
      element.style.setProperty(
        "background-color",
        modifyBackgroundColor(backgroundColor, theme),
        "important",
      );
    }

    if (textColor != null && textColor.a !== 0) {
      element.style.setProperty("color", modifyForegroundColor(textColor, theme), "important");
    }

    for (const { side, color } of borderColors) {
      if (color != null && color.a !== 0) {
        element.style.setProperty(
          `border-${side}-color`,
          modifyBorderColor(color, theme),
          "important",
        );
      }
    }

    element.setAttribute(PROCESSED_ATTRIBUTE, "");
  }

  for (const { element, backgroundImage } of snapshots) {
    if (backgroundImage && backgroundImage !== "none") {
      modifyBackgroundImage(element, backgroundImage, theme, isCancelled);
    }

    if (element instanceof HTMLImageElement) {
      invertDarkImageElement(element, theme, isCancelled);
    }
  }

  return {
    revert: () => {
      cancelled = true;

      for (const { element, originalStyle } of snapshots) {
        element.style.cssText = originalStyle;
        element.removeAttribute(PROCESSED_ATTRIBUTE);
      }
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
