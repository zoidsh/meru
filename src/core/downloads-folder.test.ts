import { describe, expect, it } from "vitest";

import { downloadsFolder, shownFolder } from "./downloads-folder.ts";

describe(downloadsFolder, () => {
  it("is the chosen folder while it is usable, else the system's, saying when it passed one over", () => {
    const deps = {
      usable: (folder: string) => folder === "/Chosen",
      system: () => "/Downloads",
    };

    expect([
      downloadsFolder(null, deps),
      downloadsFolder("/Chosen", deps),
      downloadsFolder("/Gone", deps),
    ]).toStrictEqual([
      { folder: "/Downloads", fallback: false },
      { folder: "/Chosen", fallback: false },
      { folder: "/Downloads", fallback: true },
    ]);
  });
});

describe(shownFolder, () => {
  it("shows a folder under the home folder from ~ on macOS, and every other whole", () => {
    const mac = { home: "/Users/example", platform: "darwin" } as const;

    expect([
      shownFolder("/Users/example/Downloads", mac),
      shownFolder("/Users/example", mac),
      shownFolder("/Users/example2/Downloads", mac),
      shownFolder("/Volumes/Disk/Downloads", mac),
      shownFolder("/home/example/Downloads", {
        home: "/home/example",
        platform: "linux",
      }),
      shownFolder(String.raw`C:\Users\example\Downloads`, {
        home: String.raw`C:\Users\example`,
        platform: "win32",
      }),
    ]).toStrictEqual([
      "~/Downloads",
      "~",
      "/Users/example2/Downloads",
      "/Volumes/Disk/Downloads",
      "/home/example/Downloads",
      String.raw`C:\Users\example\Downloads`,
    ]);
  });
});
