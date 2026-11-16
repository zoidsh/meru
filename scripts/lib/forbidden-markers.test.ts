import { describe, expect, it } from "vitest";

import { findForbiddenMarkers } from "./forbidden-markers.ts";

describe(findForbiddenMarkers, () => {
  it("finds every forbidden marker in every file", () => {
    expect(
      findForbiddenMarkers([
        { path: "main.mjs", contents: 'env.MERU_DEV_SERVER_URL;"\'nonce-"' },
        { path: "shell/index.html", contents: "<div></div>" },
      ]).map(({ path, marker }) => `${path}: ${marker}`)
    ).toStrictEqual(["main.mjs: MERU_DEV_SERVER_URL", "main.mjs: 'nonce-"]);
  });

  it("takes a list of its own", () => {
    expect(
      findForbiddenMarkers(
        [{ path: "main.mjs", contents: "DEV_SIGNING_KEY" }],
        [{ marker: "DEV_SIGNING_KEY", why: "development key" }]
      )
    ).toStrictEqual([
      { path: "main.mjs", marker: "DEV_SIGNING_KEY", why: "development key" },
    ]);
  });

  it("passes clean output", () => {
    expect(
      findForbiddenMarkers([{ path: "main.mjs", contents: "app.whenReady()" }])
    ).toStrictEqual([]);
  });
});
