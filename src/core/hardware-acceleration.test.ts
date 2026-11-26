import { describe, expect, it } from "vitest";

import { hardwareAccelerationAtLaunch } from "./hardware-acceleration.ts";

const launch = (text: string | undefined) =>
  hardwareAccelerationAtLaunch(text, "darwin");

describe(hardwareAccelerationAtLaunch, () => {
  it("turns it off for a stored false and keeps it for a stored true", () => {
    expect(
      launch(JSON.stringify({ version: 1, hardwareAcceleration: false }))
    ).toBeFalsy();
    expect(
      launch(JSON.stringify({ version: 1, hardwareAcceleration: true }))
    ).toBeTruthy();
  });

  it("keeps it with no file, a file without the key or a value that is not a boolean", () => {
    expect(launch(undefined)).toBeTruthy();
    expect(launch(JSON.stringify({ version: 1, theme: "dark" }))).toBeTruthy();
    expect(
      launch(JSON.stringify({ version: 1, hardwareAcceleration: "no" }))
    ).toBeTruthy();
  });

  it("keeps it for a file the store would not read", () => {
    expect(launch("{ not json")).toBeTruthy();
    expect(launch("")).toBeTruthy();
    expect(launch("null")).toBeTruthy();
    expect(
      launch(JSON.stringify({ version: "1", hardwareAcceleration: false }))
    ).toBeTruthy();
  });

  it("keeps it for a file a newer Meru wrote, whatever it holds", () => {
    expect(
      launch(JSON.stringify({ version: 2, hardwareAcceleration: false }))
    ).toBeTruthy();
  });
});
