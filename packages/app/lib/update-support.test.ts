import { describe, expect, test } from "bun:test";
import { isUpdateSupported } from "./update-support";

describe("isUpdateSupported", () => {
  test("refuses a macOS below the minimum", () => {
    expect(isUpdateSupported("darwin", "12.7.6")).toBe(false);
  });

  test("allows the minimum macOS itself", () => {
    expect(isUpdateSupported("darwin", "13.0.0")).toBe(true);
  });

  test("allows a macOS above the minimum", () => {
    expect(isUpdateSupported("darwin", "14.6.1")).toBe(true);
    expect(isUpdateSupported("darwin", "26.0.1")).toBe(true);
  });

  test("allows every other platform whatever it reports", () => {
    // Windows and Linux never had a version cut, and their system versions are
    // not on the same scale — `10.0.19045` on Windows would read as below the
    // macOS minimum if the platform were not checked first.
    expect(isUpdateSupported("win32", "10.0.19045")).toBe(true);
    expect(isUpdateSupported("linux", "6.12.101")).toBe(true);
  });

  test("compares component by component rather than as a number", () => {
    // `12.9` against `13.0.0` is the pair a lexical or float comparison gets
    // wrong in opposite directions.
    expect(isUpdateSupported("darwin", "12.9.9")).toBe(false);
    expect(isUpdateSupported("darwin", "13.1")).toBe(true);
  });

  test("lets an unrecognized version through rather than stranding the machine", () => {
    expect(isUpdateSupported("darwin", "")).toBe(true);
    expect(isUpdateSupported("darwin", "unknown")).toBe(true);
  });
});
