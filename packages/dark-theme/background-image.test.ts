import { describe, expect, test } from "bun:test";
import { modifyBackgroundImage } from "./background-image";
import { DEFAULT_THEME } from "./theme";

function createFakeElement() {
  const setPropertyCalls: Array<{ property: string; value: string; priority?: string }> = [];

  const element = {
    style: {
      setProperty: (property: string, value: string, priority?: string) => {
        setPropertyCalls.push({ property, value, priority });
      },
    },
  } as unknown as HTMLElement;

  return { element, setPropertyCalls };
}

describe("modifyBackgroundImage", () => {
  test("darkens gradient stops synchronously with a single important write", () => {
    const { element, setPropertyCalls } = createFakeElement();

    modifyBackgroundImage(
      element,
      "linear-gradient(rgb(255, 255, 255), rgb(0, 0, 0))",
      DEFAULT_THEME,
      () => false,
    );

    expect(setPropertyCalls).toEqual([
      {
        property: "background-image",
        value: "linear-gradient(#181a1b, #000000)",
        priority: "important",
      },
    ]);
  });

  test("splits layers at top-level commas only and keeps non-gradient layers as-is", () => {
    const { element, setPropertyCalls } = createFakeElement();

    modifyBackgroundImage(
      element,
      "linear-gradient(to right, rgb(255, 255, 255) calc(10% + 5px), rgb(0, 0, 0)), repeating-conic-gradient(rgba(255, 0, 0, 0.25) 0deg, transparent 90deg), cross-fade(rgb(9, 9, 9), rgb(4, 5, 6), 50%)",
      DEFAULT_THEME,
      () => false,
    );

    expect(setPropertyCalls).toEqual([
      {
        property: "background-image",
        value:
          "linear-gradient(to right, #181a1b calc(10% + 5px), #000000), repeating-conic-gradient(rgba(204, 0, 0, 0.25) 0deg, transparent 90deg), cross-fade(rgb(9, 9, 9), rgb(4, 5, 6), 50%)",
        priority: "important",
      },
    ]);
  });

  test("darkens a hex inside a gradient's var() fallback", () => {
    const { element, setPropertyCalls } = createFakeElement();

    modifyBackgroundImage(
      element,
      "linear-gradient(var(--surface, #fff), #000)",
      DEFAULT_THEME,
      () => false,
    );

    expect(setPropertyCalls).toEqual([
      {
        property: "background-image",
        value: "linear-gradient(var(--surface, #181a1b), #000000)",
        priority: "important",
      },
    ]);
  });

  test("gradient-only values never schedule a second write", async () => {
    const { element, setPropertyCalls } = createFakeElement();

    modifyBackgroundImage(
      element,
      "radial-gradient(rgb(255, 255, 255), rgb(240, 240, 240))",
      DEFAULT_THEME,
      () => false,
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(setPropertyCalls).toHaveLength(1);
  });
});
