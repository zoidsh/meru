import { describe, expect, test } from "bun:test";
import { compareExtensionVersions } from "./version";

describe("compareExtensionVersions", () => {
  test("compares component by component rather than as text", () => {
    expect(compareExtensionVersions("2", "1.9")).toBeGreaterThan(0);
    expect(compareExtensionVersions("1.9", "2")).toBeLessThan(0);
    expect(compareExtensionVersions("8.12.32.33", "8.12.4.1")).toBeGreaterThan(0);
  });

  test("counts a missing component as zero", () => {
    expect(compareExtensionVersions("1.2", "1.2.0.0")).toBe(0);
    expect(compareExtensionVersions("1.2.0.1", "1.2")).toBeGreaterThan(0);
  });

  test("has the same version equal to itself", () => {
    expect(compareExtensionVersions("8.12.32.33", "8.12.32.33")).toBe(0);
  });

  test("counts a component that is not a number as zero", () => {
    expect(compareExtensionVersions("1.beta", "1.0")).toBe(0);
    expect(compareExtensionVersions("1.beta", "1.1")).toBeLessThan(0);
  });
});
