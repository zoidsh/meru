import { describe, expect, test } from "bun:test";
import { modifyBackgroundColor, modifyForegroundColor } from "./modify-colors";
import { DEFAULT_THEME } from "./theme";
import { createVariableStore } from "./variable-store";

const white = { r: 255, g: 255, b: 255, a: 1 };

describe("createVariableStore", () => {
  test("darkens a background-consumed variable with the background pole", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--surface", "#ffffff", false);
    variableStore.collectConsumer("background-color", "var(--surface)");
    variableStore.finalizeCollection();

    expect(variableStore.isVariableDarkened("--surface")).toBe(true);
    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([
      {
        selectorText: ":root",
        groupChain: [],
        declarationText: `--surface: ${modifyBackgroundColor(white, DEFAULT_THEME)}`,
      },
    ]);
  });

  test("darkens a text-consumed variable with the foreground pole, not the background pole", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--text", "#ffffff", false);
    variableStore.collectConsumer("color", "var(--text)");
    variableStore.finalizeCollection();

    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([
      {
        selectorText: ":root",
        groupChain: [],
        declarationText: `--text: ${modifyForegroundColor(white, DEFAULT_THEME)}`,
      },
    ]);
  });

  test("never emits untyped variables", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--unused", "#ffffff", false);
    variableStore.finalizeCollection();

    expect(variableStore.isVariableDarkened("--unused")).toBe(false);
    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([]);
  });

  test("a typed but same-origin-undefined variable is not darkened", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectConsumer("background-color", "var(--runtime-only)");
    variableStore.finalizeCollection();

    expect(variableStore.isVariableDarkened("--runtime-only")).toBe(false);
  });

  test("propagates type bits one hop through var() definitions", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--alias", "var(--base, #ffffff)", false);
    variableStore.collectDefinition(":root", [], "--base", "#eeeeee", false);
    variableStore.collectConsumer("background-color", "var(--alias)");
    variableStore.finalizeCollection();

    expect(variableStore.isVariableDarkened("--base")).toBe(true);
    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([
      {
        selectorText: ":root",
        groupChain: [],
        declarationText: `--alias: var(--base, ${modifyBackgroundColor(white, DEFAULT_THEME)})`,
      },
      {
        selectorText: ":root",
        groupChain: [],
        declarationText: `--base: ${modifyBackgroundColor({ r: 238, g: 238, b: 238, a: 1 }, DEFAULT_THEME)}`,
      },
    ]);
  });

  test("pins a definition's fallback when it references an undarkened variable", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--alias", "var(--runtime-only, #ffffff)", false);
    variableStore.collectConsumer("background-color", "var(--alias)");
    variableStore.finalizeCollection();

    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([
      {
        selectorText: ":root",
        groupChain: [],
        declarationText: `--alias: ${modifyBackgroundColor(white, DEFAULT_THEME)}`,
      },
    ]);
  });

  test("background consumption wins over text consumption for multi-typed variables", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--shared", "#ffffff", false);
    variableStore.collectConsumer("color", "var(--shared)");
    variableStore.collectConsumer("background-color", "var(--shared)");
    variableStore.finalizeCollection();

    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([
      {
        selectorText: ":root",
        groupChain: [],
        declarationText: `--shared: ${modifyBackgroundColor(white, DEFAULT_THEME)}`,
      },
    ]);
  });

  test("darkens gradient stops of an image-consumed variable and keeps urls", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(
      ".banner",
      ["@media (min-width: 100px)"],
      "--banner-image",
      "linear-gradient(#ffffff, #000000), url(photo.png)",
      true,
    );
    variableStore.collectConsumer("background-image", "var(--banner-image)");
    variableStore.finalizeCollection();

    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([
      {
        selectorText: ".banner",
        groupChain: ["@media (min-width: 100px)"],
        declarationText:
          "--banner-image: linear-gradient(#181a1b, #000000), url(photo.png) !important",
      },
    ]);
  });

  test("darkens keyword color definitions", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--surface", "white", false);
    variableStore.collectConsumer("background-color", "var(--surface)");
    variableStore.finalizeCollection();

    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([
      {
        selectorText: ":root",
        groupChain: [],
        declarationText: `--surface: ${modifyBackgroundColor(white, DEFAULT_THEME)}`,
      },
    ]);
  });

  test("skips definitions the darkening leaves unchanged", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--overlay", "rgba(0, 0, 0, 0)", false);
    variableStore.collectConsumer("background-color", "var(--overlay)");
    variableStore.finalizeCollection();

    expect(variableStore.isVariableDarkened("--overlay")).toBe(true);
    expect(variableStore.buildDarkenedDefinitions(DEFAULT_THEME)).toEqual([]);
  });

  test("finalizeCollection reports whether the darkened set changed", () => {
    const variableStore = createVariableStore();

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--surface", "#ffffff", false);
    variableStore.collectConsumer("background-color", "var(--surface)");

    expect(variableStore.finalizeCollection()).toBe(true);

    variableStore.beginCollection();
    variableStore.collectDefinition(":root", [], "--surface", "#ffffff", false);
    variableStore.collectConsumer("background-color", "var(--surface)");

    expect(variableStore.finalizeCollection()).toBe(false);

    variableStore.beginCollection();

    expect(variableStore.finalizeCollection()).toBe(true);
  });
});
