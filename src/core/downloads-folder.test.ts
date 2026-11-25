import { describe, expect, it } from "vitest";

import { shownFolder } from "./downloads-folder.ts";

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
