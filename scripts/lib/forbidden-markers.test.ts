import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_IN_PROD,
  findForbiddenMarkers,
} from "./forbidden-markers.ts";

describe(findForbiddenMarkers, () => {
  it("finds every forbidden marker in every file, and nothing in clean output", () => {
    expect(
      findForbiddenMarkers(
        [
          { path: "main.mjs", contents: 'env.MERU_DEV_SERVER_URL;"\'nonce-"' },
          { path: "shell/index.html", contents: "<div></div>" },
        ],
        FORBIDDEN_IN_PROD
      ).map(({ path, marker }) => `${path}: ${marker}`)
    ).toStrictEqual(["main.mjs: MERU_DEV_SERVER_URL", "main.mjs: 'nonce-"]);
  });
});
