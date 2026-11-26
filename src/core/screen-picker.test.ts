import { describe, expect, it } from "vitest";

import { APPS } from "./apps.ts";
import {
  blocksListing,
  listedCard,
  mayShareScreen,
  usesSystemPicker,
} from "./screen-picker.ts";

const source = (id: string) => ({ id, name: id, thumbnail: "" });

describe(listedCard, () => {
  it("lists windows apart from screens, each in the order given", () => {
    expect(
      listedCard([
        source("screen:1:0"),
        source("window:9:0"),
        source("window:3:0"),
        source("screen:2:0"),
      ])
    ).toStrictEqual({
      kind: "listed",
      windows: [source("window:9:0"), source("window:3:0")],
      screens: [source("screen:1:0"), source("screen:2:0")],
    });
  });
});

describe(blocksListing, () => {
  it("blocks only on macOS, once the person or a policy refused", () => {
    expect(
      (
        [
          "granted",
          "denied",
          "restricted",
          "not-determined",
          "unknown",
        ] as const
      ).map((status) => blocksListing("darwin", status))
    ).toStrictEqual([false, true, true, false, false]);
    expect(blocksListing("win32", "denied")).toBeFalsy();
    expect(blocksListing("linux", "restricted")).toBeFalsy();
  });
});

describe(usesSystemPicker, () => {
  it("asks for the system's picker on macOS alone, while the setting is on", () => {
    expect([
      usesSystemPicker("darwin", true),
      usesSystemPicker("darwin", false),
      usesSystemPicker("win32", true),
      usesSystemPicker("linux", true),
    ]).toStrictEqual([true, false, false, false]);
  });
});

describe(mayShareScreen, () => {
  it("offers a screen only to a frame on Meet's own origin", () => {
    expect(
      [
        "https://meet.google.com",
        "https://mail.google.com",
        "https://www.youtube.com",
        "https://example.com",
        "null",
        undefined,
      ].map((origin) => mayShareScreen(APPS, origin))
    ).toStrictEqual([true, false, false, false, false, false]);
  });
});
