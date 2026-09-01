import { describe, expect, test } from "bun:test";
import { compareExtensionVersions, isExtensionVersion } from "./version";

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

describe("isExtensionVersion", () => {
  test("takes one to four dot-separated numbers, the way Chromium does", () => {
    expect(isExtensionVersion("1")).toBe(true);
    expect(isExtensionVersion("1.2")).toBe(true);
    expect(isExtensionVersion("8.12.32.33")).toBe(true);
    expect(isExtensionVersion("1.2.3.4.5")).toBe(false);
  });

  test("refuses everything an install would join onto a path", () => {
    expect(isExtensionVersion("")).toBe(false);
    expect(isExtensionVersion("../escaped")).toBe(false);
    expect(isExtensionVersion("1.0.0/nested")).toBe(false);
    expect(isExtensionVersion(".")).toBe(false);
  });

  test("refuses a version that is not numbers", () => {
    expect(isExtensionVersion("1.0.0.staging")).toBe(false);
    expect(isExtensionVersion("1.0.0-beta")).toBe(false);
    expect(isExtensionVersion("-1.0")).toBe(false);
    expect(isExtensionVersion("1.")).toBe(false);
  });
});
