import { describe, expect, test } from "bun:test";
import { getNextZoomFactor, MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR } from "./zoom";

describe("getNextZoomFactor", () => {
  test("steps from 100% to the neighbouring presets", () => {
    expect(getNextZoomFactor(1, "in")).toBe(1.1);
    expect(getNextZoomFactor(1, "out")).toBe(0.9);
  });

  test("steps through the thirds", () => {
    expect(getNextZoomFactor(0.25, "in")).toBe(1 / 3);
    expect(getNextZoomFactor(0.5, "out")).toBe(1 / 3);
  });

  test("stays put at either end", () => {
    expect(getNextZoomFactor(MAX_ZOOM_FACTOR, "in")).toBe(MAX_ZOOM_FACTOR);
    expect(getNextZoomFactor(MIN_ZOOM_FACTOR, "out")).toBe(MIN_ZOOM_FACTOR);
  });

  test("an off-list factor goes to the preset on either side", () => {
    expect(getNextZoomFactor(1.3, "in")).toBe(1.5);
    expect(getNextZoomFactor(1.3, "out")).toBe(1.25);
  });

  test("a factor a hair off a preset counts as that preset", () => {
    expect(getNextZoomFactor(1.1000000001, "in")).toBe(1.25);
    expect(getNextZoomFactor(1.1000000001, "out")).toBe(1);
    expect(getNextZoomFactor(1.0999999999, "in")).toBe(1.25);
    expect(getNextZoomFactor(1.0000000000000002, "out")).toBe(0.9);
  });

  test("an off-list factor past an end comes back inside the range", () => {
    expect(getNextZoomFactor(0.1, "in")).toBe(0.25);
    expect(getNextZoomFactor(6, "out")).toBe(5);
  });
});
