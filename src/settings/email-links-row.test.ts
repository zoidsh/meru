import { describe, expect, it } from "vitest";

import { emailLinksRow } from "./email-links-row.ts";

const row = (
  platform: string,
  {
    isDefault = false,
    real = true,
    needsPro = false,
  }: { isDefault?: boolean; real?: boolean; needsPro?: boolean } = {}
) => emailLinksRow({ platform, isDefault, real, needsPro });

describe(emailLinksRow, () => {
  it("is a switch on macOS, turned either way, saying Meru asks which profile", () => {
    expect(row("darwin")).toStrictEqual({
      control: "switch",
      checked: false,
      disabled: false,
      description: "asks",
    });
    expect(row("darwin", { isDefault: true })).toStrictEqual({
      control: "switch",
      checked: true,
      disabled: false,
      description: "asks",
    });
  });

  it("is a switch on Linux that, once on, stays on and says where to change it", () => {
    expect(row("linux")).toStrictEqual({
      control: "switch",
      checked: false,
      disabled: false,
      description: "asks",
    });
    expect(row("linux", { isDefault: true })).toStrictEqual({
      control: "switch",
      checked: true,
      disabled: true,
      description: "meru-opens-change-in-system",
    });
  });

  it("is a button to Windows Settings on Windows, its words following the choice", () => {
    expect(row("win32")).toStrictEqual({
      control: "button",
      checked: false,
      disabled: false,
      description: "choose-in-windows",
    });
    expect(row("win32", { isDefault: true })).toStrictEqual({
      control: "button",
      checked: true,
      disabled: false,
      description: "meru-opens",
    });
  });

  it("is disabled on the free version, on every system", () => {
    for (const platform of ["darwin", "linux", "win32"]) {
      expect(row(platform, { needsPro: true }).disabled).toBeTruthy();
    }

    expect(row("darwin", { needsPro: true, isDefault: true })).toMatchObject({
      checked: true,
      description: "asks",
    });
  });

  it("is disabled in a build that is not a release's, saying it can open none", () => {
    expect(row("darwin", { real: false, isDefault: true })).toStrictEqual({
      control: "switch",
      checked: false,
      disabled: true,
      description: "development",
    });
    expect(row("win32", { real: false })).toStrictEqual({
      control: "button",
      checked: false,
      disabled: true,
      description: "development",
    });
    expect(row("linux", { real: false, needsPro: true })).toMatchObject({
      disabled: true,
      description: "development",
    });
  });
});
