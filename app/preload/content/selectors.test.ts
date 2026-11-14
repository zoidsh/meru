import { describe, expect, it } from "vitest";

import { missed, resolveEntry } from "./selectors.ts";
import type { ClassCache } from "./selectors.ts";

const entry = {
  anchor: '[data-legacy-thread-id] [aria-label="Starred"]',
  cacheClass: true,
  context: 'div[role="main"]',
  hop: "[data-legacy-thread-id]",
  id: "row",
};

const mount = () => {
  document.body.innerHTML = `
    <div role="main">
      <div class="zA yO" data-legacy-thread-id="t1">
        <span class="T-KT" aria-label="Starred"></span>
      </div>
    </div>`;
};

describe(resolveEntry, () => {
  it("hops from the marker to the element the feature wants", () => {
    mount();
    const found = resolveEntry(document, entry, new Map());

    expect(found).toHaveLength(1);
    expect(found[0]?.dataset.legacyThreadId).toBe("t1");
  });

  it("remembers the classes it found and re-detects them once they are gone", () => {
    mount();
    const cache: ClassCache = new Map();

    resolveEntry(document, entry, cache);
    expect(cache.get("row")).toBe(".zA.yO");

    const row = document.querySelector("[data-legacy-thread-id]");
    row?.setAttribute("class", "zB yO");

    expect(resolveEntry(document, entry, cache)).toHaveLength(1);
    expect(cache.get("row")).toBe(".zB.yO");
  });

  it("finds nothing once the marker is gone", () => {
    mount();
    document.body.innerHTML = '<div role="main"></div>';

    expect(resolveEntry(document, entry, new Map())).toStrictEqual([]);
  });
});

describe(missed, () => {
  it("counts a miss only where the context says the entry must match", () => {
    mount();
    expect(missed(document, entry, [])).toBeTruthy();
    expect(missed(document, entry, [document.body])).toBeFalsy();

    document.body.innerHTML = "<div></div>";
    expect(missed(document, entry, [])).toBeFalsy();

    expect(missed(document, { anchor: ".x", id: "x" }, [])).toBeFalsy();
  });
});
