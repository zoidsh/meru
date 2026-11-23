import { describe, expect, it } from "vitest";

import { browsingDataTypes } from "./browsing-data.ts";

describe(browsingDataTypes, () => {
  it("names the cache alone, the site data alone, both in v3's order, or nothing", () => {
    expect([
      browsingDataTypes({ cookies: false, cache: true }),
      browsingDataTypes({ cookies: true, cache: false }),
      browsingDataTypes({ cookies: true, cache: true }),
      browsingDataTypes({ cookies: false, cache: false }),
    ]).toStrictEqual([
      ["cache"],
      [
        "cookies",
        "localStorage",
        "indexedDB",
        "serviceWorkers",
        "fileSystems",
        "backgroundFetch",
      ],
      [
        "cache",
        "cookies",
        "localStorage",
        "indexedDB",
        "serviceWorkers",
        "fileSystems",
        "backgroundFetch",
      ],
      [],
    ]);
  });
});
