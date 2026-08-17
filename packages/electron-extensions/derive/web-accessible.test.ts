import { describe, expect, test } from "bun:test";
import { findWebAccessiblePattern } from "./web-accessible";

describe("findWebAccessiblePattern", () => {
  test("matches an exact path", () => {
    expect(
      findWebAccessiblePattern([{ resources: ["chrome-facade.js"] }], "chrome-facade.js"),
    ).toBe("chrome-facade.js");
  });

  test("matches a wildcard across separators the way Chrome does", () => {
    expect(findWebAccessiblePattern([{ resources: ["*.js"] }], "chrome-facade.js")).toBe("*.js");

    expect(findWebAccessiblePattern([{ resources: ["*"] }], "chrome-facade.js")).toBe("*");

    expect(findWebAccessiblePattern([{ resources: ["inline/*"] }], "inline/menu/menu.html")).toBe(
      "inline/*",
    );
  });

  test("matches a root-relative pattern spelled with a leading slash", () => {
    expect(
      findWebAccessiblePattern([{ resources: ["/chrome-facade.js"] }], "chrome-facade.js"),
    ).toBe("/chrome-facade.js");
  });

  test("matches manifest v2 entries, which are plain patterns", () => {
    expect(findWebAccessiblePattern(["*.js"], "chrome-facade.js")).toBe("*.js");
  });

  test("passes over patterns that only share a suffix or a prefix", () => {
    expect(
      findWebAccessiblePattern(
        [
          {
            resources: [
              "fonts/*.woff2",
              "images/*.svg",
              "inline/injected.js",
              "*.js.map",
              "facade.js",
            ],
          },
        ],
        "chrome-facade.js",
      ),
    ).toBeUndefined();
  });

  test("treats a wildcard as the only special character", () => {
    expect(
      findWebAccessiblePattern([{ resources: ["chrome.facade|js"] }], "chromeXfacade|js"),
    ).toBeUndefined();
  });

  test("answers nothing for a manifest without the key or with a malformed one", () => {
    expect(findWebAccessiblePattern(undefined, "chrome-facade.js")).toBeUndefined();

    expect(
      findWebAccessiblePattern(
        [{ resources: undefined }, {} as { resources?: string[] }],
        "chrome-facade.js",
      ),
    ).toBeUndefined();
  });
});
