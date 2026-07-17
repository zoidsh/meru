import { describe, expect, test } from "bun:test";
import { modifyBackgroundColor, modifyBorderColor, modifyForegroundColor } from "./modify-colors";
import {
  getDarkenedDeclaration,
  getDeclarationRoute,
  isSafeToInvert,
  type DeclarationDarkeningContext,
} from "./modify-declaration";
import { DEFAULT_THEME } from "./theme";

function createContext(
  overrides?: Partial<DeclarationDarkeningContext>,
): DeclarationDarkeningContext {
  return {
    theme: DEFAULT_THEME,
    isVariableDarkened: () => false,
    isCancelled: () => false,
    ...overrides,
  };
}

describe("getDeclarationRoute", () => {
  test("routes color-bearing properties and rejects the rest", () => {
    expect(getDeclarationRoute("background-color")).toBe("background");
    expect(getDeclarationRoute("color")).toBe("foreground");
    expect(getDeclarationRoute("stop-color")).toBe("foreground");
    expect(getDeclarationRoute("border-top-color")).toBe("border");
    expect(getDeclarationRoute("outline")).toBe("border");
    expect(getDeclarationRoute("box-shadow")).toBe("shadow");
    expect(getDeclarationRoute("background-image")).toBe("image");
    expect(getDeclarationRoute("list-style-image")).toBe("image");
    expect(getDeclarationRoute("display")).toBeNull();
    expect(getDeclarationRoute("--surface")).toBeNull();
  });
});

describe("getDarkenedDeclaration", () => {
  test("darkens each route with its pole", () => {
    expect(
      getDarkenedDeclaration("background-color", "rgb(255, 255, 255)", false, createContext()),
    ).toEqual({
      property: "background-color",
      value: modifyBackgroundColor({ r: 255, g: 255, b: 255, a: 1 }, DEFAULT_THEME),
      important: false,
    });

    expect(getDarkenedDeclaration("color", "rgb(20, 20, 20)", false, createContext())).toEqual({
      property: "color",
      value: modifyForegroundColor({ r: 20, g: 20, b: 20, a: 1 }, DEFAULT_THEME),
      important: false,
    });

    expect(
      getDarkenedDeclaration("border-top-color", "rgb(220, 220, 220)", false, createContext()),
    ).toEqual({
      property: "border-top-color",
      value: modifyBorderColor({ r: 220, g: 220, b: 220, a: 1 }, DEFAULT_THEME),
      important: false,
    });
  });

  test("darkens keyword colors given as the whole value", () => {
    expect(getDarkenedDeclaration("background-color", "white", false, createContext())).toEqual({
      property: "background-color",
      value: modifyBackgroundColor({ r: 255, g: 255, b: 255, a: 1 }, DEFAULT_THEME),
      important: false,
    });

    expect(getDarkenedDeclaration("color", "black", false, createContext())).toEqual({
      property: "color",
      value: modifyForegroundColor({ r: 0, g: 0, b: 0, a: 1 }, DEFAULT_THEME),
      important: false,
    });
  });

  test("darkens shadow color tokens with the background pole and keeps offsets", () => {
    expect(
      getDarkenedDeclaration("box-shadow", "0 0 4px rgb(255, 255, 255)", false, createContext()),
    ).toEqual({
      property: "box-shadow",
      value: "0 0 4px #181a1b",
      important: false,
    });
  });

  test("darkens a border shorthand's color token in place", () => {
    expect(
      getDarkenedDeclaration("border", "1px solid rgb(230, 230, 230)", false, createContext()),
    ).toEqual({
      property: "border",
      value: `1px solid ${modifyBorderColor({ r: 230, g: 230, b: 230, a: 1 }, DEFAULT_THEME)}`,
      important: false,
    });
  });

  test("mirrors the source importance", () => {
    expect(
      getDarkenedDeclaration("background-color", "rgb(255, 255, 255)", true, createContext()),
    ).toMatchObject({ important: true });
  });

  test("passes cascade keywords and colorless values through", () => {
    expect(
      getDarkenedDeclaration("background-color", "inherit", false, createContext()),
    ).toBeNull();
    expect(
      getDarkenedDeclaration("background-color", "transparent", false, createContext()),
    ).toBeNull();
    expect(getDarkenedDeclaration("color", "currentColor", false, createContext())).toBeNull();
    expect(getDarkenedDeclaration("background-image", "none", false, createContext())).toBeNull();
    expect(getDarkenedDeclaration("background-color", "", false, createContext())).toBeNull();
  });

  test("returns null for non-color properties", () => {
    expect(getDarkenedDeclaration("display", "block", false, createContext())).toBeNull();
  });

  test("keeps fully transparent tokens and emits no override for them", () => {
    expect(
      getDarkenedDeclaration("background-color", "rgba(0, 0, 0, 0)", false, createContext()),
    ).toBeNull();
  });

  test("keeps var() references and darkens their fallbacks when the variable is darkened", () => {
    const context = createContext({ isVariableDarkened: () => true });

    expect(
      getDarkenedDeclaration("background-color", "var(--surface, #fff)", false, context),
    ).toEqual({
      property: "background-color",
      value: "var(--surface, #181a1b)",
      important: false,
    });

    expect(getDarkenedDeclaration("color", "var(--text-color)", false, context)).toBeNull();
  });

  test("pins unknown variables to their darkened fallbacks", () => {
    expect(
      getDarkenedDeclaration("background-color", "var(--unknown, #fff)", false, createContext()),
    ).toEqual({
      property: "background-color",
      value: "#181a1b",
      important: false,
    });
  });

  test("emits nothing for an unknown variable whose flattened value has no visible color", () => {
    expect(
      getDarkenedDeclaration(
        "background-color",
        "var(--unknown, rgba(0, 0, 0, 0))",
        false,
        createContext(),
      ),
    ).toBeNull();
  });

  test("darkens gradient image values synchronously", () => {
    const darkenedDeclaration = getDarkenedDeclaration(
      "background-image",
      "linear-gradient(rgb(255, 255, 255), rgb(0, 0, 0))",
      false,
      createContext(),
    );

    expect(darkenedDeclaration).toEqual({
      property: "background-image",
      value: {
        immediateValue: "linear-gradient(#181a1b, #000000)",
        finalValuePromise: null,
      },
      important: false,
    });
  });

  test("emits nothing for an image value the sync pass leaves unchanged", () => {
    expect(
      getDarkenedDeclaration(
        "background-image",
        "cross-fade(rgb(9, 9, 9), rgb(4, 5, 6), 50%)",
        false,
        createContext(),
      ),
    ).toBeNull();
  });
});

describe("isSafeToInvert", () => {
  test("allows undeclared and non-tiling backgrounds", () => {
    expect(isSafeToInvert(undefined, undefined)).toBe(true);
    expect(isSafeToInvert("no-repeat", "20px")).toBe(true);
  });

  test("declines tiled backgrounds", () => {
    expect(isSafeToInvert("repeat", undefined)).toBe(false);
    expect(isSafeToInvert("repeat-x", undefined)).toBe(false);
    expect(isSafeToInvert("no-repeat, round", undefined)).toBe(false);
  });

  test("declines stretched backgrounds", () => {
    expect(isSafeToInvert(undefined, "cover")).toBe(false);
    expect(isSafeToInvert(undefined, "contain")).toBe(false);
    expect(isSafeToInvert("no-repeat", "100% 100%")).toBe(false);
  });
});
