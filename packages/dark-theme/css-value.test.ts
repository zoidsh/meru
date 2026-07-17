import { describe, expect, test } from "bun:test";
import type { RGBA } from "./color";
import {
  forEachVariableReference,
  modifyColorTokens,
  replaceColorTokens,
  substituteVarFallbacks,
} from "./css-value";
import { ADJUSTED_THEME } from "./modify-colors.fixtures";
import { DEFAULT_THEME } from "./theme";

function createRecordingModifier() {
  const recordedColors: RGBA[] = [];

  return {
    recordedColors,
    replaceWithMarker: (rgb: RGBA) => {
      recordedColors.push(rgb);

      return "MARKER";
    },
  };
}

describe("modifyColorTokens", () => {
  test("replaces every color token and leaves the rest intact", () => {
    const { recordedColors, replaceWithMarker } = createRecordingModifier();

    expect(
      modifyColorTokens("0 1px 2px rgba(0, 0, 0, 0.2), inset 0 0 0 1px #fff", replaceWithMarker),
    ).toBe("0 1px 2px MARKER, inset 0 0 0 1px MARKER");
    expect(recordedColors).toEqual([
      { r: 0, g: 0, b: 0, a: 0.2 },
      { r: 255, g: 255, b: 255, a: 1 },
    ]);
  });

  test("matches token starts case-insensitively", () => {
    const { replaceWithMarker } = createRecordingModifier();

    expect(modifyColorTokens("RGB(1, 2, 3) HSLA(120, 50%, 50%, 0.5) #ABC", replaceWithMarker)).toBe(
      "MARKER MARKER MARKER",
    );
  });

  test("a hex candidate that fails to parse round-trips verbatim", () => {
    const { recordedColors, replaceWithMarker } = createRecordingModifier();

    expect(modifyColorTokens("#ffgg", replaceWithMarker)).toBe("#ffgg");
    expect(modifyColorTokens("#1234567", replaceWithMarker)).toBe("#1234567");
    expect(recordedColors).toEqual([]);
  });

  test("a function token with nested parens that fails to parse round-trips verbatim", () => {
    const { recordedColors, replaceWithMarker } = createRecordingModifier();

    expect(modifyColorTokens("rgba(0, 0, 0, calc(0.5)) solid", replaceWithMarker)).toBe(
      "rgba(0, 0, 0, calc(0.5)) solid",
    );
    expect(recordedColors).toEqual([]);
  });

  test("tokens containing var() are skipped, later tokens still replaced", () => {
    const { recordedColors, replaceWithMarker } = createRecordingModifier();

    expect(modifyColorTokens("rgba(var(--x), 0.5) #fff", replaceWithMarker)).toBe(
      "rgba(var(--x), 0.5) MARKER",
    );
    expect(recordedColors).toEqual([{ r: 255, g: 255, b: 255, a: 1 }]);
  });

  test("a hex inside a var() fallback is itself a token", () => {
    const { replaceWithMarker } = createRecordingModifier();

    expect(modifyColorTokens("var(--x, #fff)", replaceWithMarker)).toBe("var(--x, MARKER)");
  });

  test("a null result from modify keeps the token", () => {
    expect(modifyColorTokens("rgb(1, 2, 3)", () => null)).toBe("rgb(1, 2, 3)");
  });

  test("an unbalanced function token runs to the end of the value", () => {
    const { recordedColors, replaceWithMarker } = createRecordingModifier();

    expect(modifyColorTokens("rgb(1, 2, 3", replaceWithMarker)).toBe("rgb(1, 2, 3");
    expect(recordedColors).toEqual([]);
  });

  test("values without color tokens are returned unchanged", () => {
    const { recordedColors, replaceWithMarker } = createRecordingModifier();

    expect(modifyColorTokens("10px solid red", replaceWithMarker)).toBe("10px solid red");
    expect(recordedColors).toEqual([]);
  });
});

describe("replaceColorTokens", () => {
  test("remaps tokens through the background color math", () => {
    expect(replaceColorTokens("linear-gradient(#fff, #000)", DEFAULT_THEME)).toBe(
      "linear-gradient(#181a1b, #000000)",
    );
    expect(replaceColorTokens("0 0 4px rgba(255, 255, 255, 0.5)", DEFAULT_THEME)).toBe(
      "0 0 4px rgba(24, 26, 27, 0.5)",
    );
  });

  test("adjusted theme output matches the same math", () => {
    expect(replaceColorTokens("linear-gradient(#fff, #000)", ADJUSTED_THEME)).toBe(
      "linear-gradient(#0d1116, #000000)",
    );
  });
});

describe("substituteVarFallbacks", () => {
  test("replaces a var() with its fallback", () => {
    expect(substituteVarFallbacks("var(--a, #fff)")).toBe("#fff");
  });

  test("nested fallbacks resolve to the innermost value", () => {
    expect(substituteVarFallbacks("var(--a, var(--b, #fff))")).toBe("#fff");
  });

  test("a var() without a fallback is left intact", () => {
    expect(substituteVarFallbacks("var(--x)")).toBe("var(--x)");
    expect(
      substituteVarFallbacks("linear-gradient(var(--g1, rgba(0, 0, 0, 0.5)), var(--g2))"),
    ).toBe("linear-gradient(rgba(0, 0, 0, 0.5), var(--g2))");
  });

  test("fallbacks containing parenthesized commas stay whole", () => {
    expect(substituteVarFallbacks("var(--shadow, 0 0 0 rgb(1, 2, 3))")).toBe("0 0 0 rgb(1, 2, 3)");
  });

  test("whitespace around the name and fallback is tolerated", () => {
    expect(substituteVarFallbacks("var( --a , #fff )")).toBe("#fff");
    expect(substituteVarFallbacks("var(\u00a0--a, red)")).toBe("red");
  });

  test("unbalanced input is returned unchanged", () => {
    expect(substituteVarFallbacks("var(--a, #fff")).toBe("var(--a, #fff");
  });
});

describe("forEachVariableReference", () => {
  const collectVariableNames = (value: string) => {
    const variableNames: string[] = [];

    forEachVariableReference(value, (variableName) => {
      variableNames.push(variableName);
    });

    return variableNames;
  };

  test("visits every referenced name, including nested fallback references", () => {
    expect(collectVariableNames("var(--a, var(--b, #fff)) solid var( --c )")).toEqual([
      "--a",
      "--b",
      "--c",
    ]);
  });

  test("ignores text that is not a var() reference with a custom property name", () => {
    expect(collectVariableNames("url(var.png) rgb(1, 2, 3) var(invalid)")).toEqual([]);
  });
});
