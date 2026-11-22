import { describe, expect, it } from "vitest";

import { SEARCH_QUERY_MAX_LENGTH } from "./gmail-hash.ts";
import {
  SAVED_SEARCHES_MAX,
  addSavedSearch,
  removeSavedSearch,
  renameSavedSearch,
  savedSearchName,
  savedSearchRefusal,
  savedSearches,
} from "./saved-searches.ts";
import { decodeState, encodeState } from "./state.ts";
import type { State } from "./state.ts";

const PROFILE = "p1";
const OTHER = "p2";

const stateWith = (savedSearchesValue?: unknown): State => {
  const decoded = decodeState({
    version: 1,
    profiles: [
      {
        id: PROFILE,
        name: "Default",
        ...(savedSearchesValue !== undefined && {
          savedSearches: savedSearchesValue,
        }),
      },
      { id: OTHER, name: "Work" },
    ],
    selectedProfileId: PROFILE,
  });

  if (decoded.kind !== "read") {
    throw new Error("The state did not decode");
  }

  return decoded.value;
};

const written = (state: State) =>
  (encodeState(state) as { profiles: Record<string, unknown>[] }).profiles[0]
    ?.savedSearches;

let ids = 0;
const newId = () => {
  ids += 1;

  return `s${ids}`;
};

describe(savedSearches, () => {
  it("reads none from a profile that has none", () => {
    expect(savedSearches(stateWith(), PROFILE)).toStrictEqual([]);
    expect(savedSearches(stateWith(), "gone")).toStrictEqual([]);
  });

  it("reads the entries that parse, in order, and writes every entry back as found", () => {
    const entries = [
      { id: "a", query: "is:starred" },
      "garbage",
      { id: "b", query: 'subject:"x"', label: "Quoted", later: [1] },
      { id: "", query: "no id" },
      { id: "c", query: "   " },
      { id: "d", query: "a".repeat(SEARCH_QUERY_MAX_LENGTH + 1) },
      { id: "e" },
    ];
    const state = stateWith(entries);

    expect(savedSearches(state, PROFILE)).toStrictEqual([
      { id: "a", query: "is:starred" },
      { id: "b", query: 'subject:"x"', label: "Quoted", later: [1] },
    ]);
    expect(written(state)).toStrictEqual(entries);
  });

  it("hides a query or label that is not well formed, and keeps it as found", () => {
    const entries = JSON.parse(
      String.raw`[{"id":"b","query":"x\ud800"},{"id":"c","query":"y","label":"\udc00"},{"id":"d","query":"z"}]`
    ) as unknown[];
    const state = stateWith(entries);

    expect(savedSearches(state, PROFILE)).toStrictEqual([
      { id: "d", query: "z" },
    ]);
    expect(written(state)).toStrictEqual(entries);
  });

  it("shows the first of two searches with one id, and keeps the later as found", () => {
    const entries = [
      { id: "a", query: "x" },
      { id: "a", query: "y" },
    ];
    const state = stateWith(entries);

    expect(savedSearches(state, PROFILE)).toStrictEqual([
      { id: "a", query: "x" },
    ]);
    expect(written(state)).toStrictEqual(entries);
  });

  it("reads a value that is not a list as none, and keeps it", () => {
    const state = stateWith({ id: "a", query: "x" });

    expect(savedSearches(state, PROFILE)).toStrictEqual([]);
    expect(written(state)).toStrictEqual({ id: "a", query: "x" });
    expect(savedSearchRefusal(state, PROFILE, "x")).toBe("unwritable");
  });
});

const added = (result: ReturnType<typeof addSavedSearch>) =>
  "state" in result ? result.state : undefined;

describe(addSavedSearch, () => {
  it("adds the query, trimmed and unnamed, to the profile's list alone", () => {
    const state = added(
      addSavedSearch(
        stateWith(),
        PROFILE,
        { query: '  subject:"out of office" ' },
        () => "new"
      )
    );

    expect(state && savedSearches(state, PROFILE)).toStrictEqual([
      { id: "new", query: 'subject:"out of office"' },
    ]);
    expect(state && savedSearches(state, OTHER)).toStrictEqual([]);
  });

  it("names it by the name trimmed and without control characters, an empty one naming nothing", () => {
    const named = added(
      addSavedSearch(
        stateWith(),
        PROFILE,
        { query: "x", name: " \u0007Receipts " },
        () => "a"
      )
    );
    const unnamed = added(
      addSavedSearch(
        stateWith(),
        PROFILE,
        { query: "x", name: "  " },
        () => "a"
      )
    );

    expect([
      named && written(named),
      unnamed && written(unnamed),
    ]).toStrictEqual([
      [{ id: "a", query: "x", label: "Receipts" }],
      [{ id: "a", query: "x" }],
    ]);
  });

  it("adds after the entries that do not parse, which stay", () => {
    const state = added(
      addSavedSearch(
        stateWith(["garbage"]),
        PROFILE,
        { query: "x" },
        () => "new"
      )
    );

    expect(state && written(state)).toStrictEqual([
      "garbage",
      { id: "new", query: "x" },
    ]);
  });

  it("says why it refuses an empty or repeated query, a full list and what it cannot write", () => {
    const state = stateWith([{ id: "a", query: "x" }]);
    const full = stateWith(
      Array.from({ length: SAVED_SEARCHES_MAX }, (_, index) => ({
        id: `f${index}`,
        query: `q${index}`,
      }))
    );
    const refusal = (on: State, query: string, name?: string) => {
      const result = addSavedSearch(on, PROFILE, { query, name }, newId);

      return "refused" in result ? result.refused : undefined;
    };

    expect([
      refusal(state, "  "),
      refusal(state, " x "),
      refusal(full, "y"),
      refusal(state, "a".repeat(SEARCH_QUERY_MAX_LENGTH + 1)),
      refusal(state, "x\uD800"),
      refusal(state, "y", "n".repeat(65)),
      refusal(stateWith("kept"), "y"),
      addSavedSearch(state, "gone", { query: "y" }, newId),
      refusal(state, "X"),
      refusal(state, "x  y"),
    ]).toStrictEqual([
      "empty",
      "duplicate",
      "full",
      "unwritable",
      "unwritable",
      "unwritable",
      "unwritable",
      { refused: "unwritable" },
      undefined,
      undefined,
    ]);
  });
});

describe(savedSearchRefusal, () => {
  it("allows what the profile does not have, on that profile alone", () => {
    const state = stateWith([{ id: "a", query: "x" }]);

    expect([
      savedSearchRefusal(state, PROFILE, "x"),
      savedSearchRefusal(state, OTHER, "x"),
    ]).toStrictEqual(["duplicate", undefined]);
  });
});

describe(renameSavedSearch, () => {
  const entries = [
    { id: "a", query: "x", extra: 1 },
    { id: "b", query: "y", label: "Old" },
  ];

  it("names the search, trimmed, keeping keys it does not know", () => {
    const state = renameSavedSearch(stateWith(entries), PROFILE, "a", " New ");

    expect(state && written(state)).toStrictEqual([
      { id: "a", query: "x", extra: 1, label: "New" },
      entries[1],
    ]);
  });

  it("clears the name with an empty one, so the query stands in", () => {
    const state = renameSavedSearch(stateWith(entries), PROFILE, "b", "  ");

    expect(state && written(state)).toStrictEqual([
      entries[0],
      { id: "b", query: "y" },
    ]);
  });

  it("renames only the shown one of two searches with one id", () => {
    const state = renameSavedSearch(
      stateWith([
        { id: "a", query: "x" },
        { id: "a", query: "z" },
      ]),
      PROFILE,
      "a",
      "N"
    );

    expect(state && written(state)).toStrictEqual([
      { id: "a", query: "x", label: "N" },
      { id: "a", query: "z" },
    ]);
  });

  it("changes nothing for an unknown search or profile, the same name or one too long", () => {
    const state = stateWith(entries);

    expect(
      [
        renameSavedSearch(state, PROFILE, "gone", "N"),
        renameSavedSearch(state, "gone", "a", "N"),
        renameSavedSearch(state, PROFILE, "b", " Old "),
        renameSavedSearch(state, PROFILE, "a", ""),
        renameSavedSearch(state, PROFILE, "a", "n".repeat(65)),
      ].every((next) => next === undefined)
    ).toBeTruthy();
  });
});

describe(removeSavedSearch, () => {
  it("removes the search by its id, keeping the rest and what does not parse", () => {
    const state = removeSavedSearch(
      stateWith([{ id: "a", query: "x" }, 7, { id: "b", query: "y" }]),
      PROFILE,
      "a"
    );

    expect(state && written(state)).toStrictEqual([7, { id: "b", query: "y" }]);
  });

  it("removes only the shown one of two searches with one id", () => {
    const state = removeSavedSearch(
      stateWith([
        { id: "a", query: "   " },
        { id: "a", query: "x" },
        { id: "a", query: "y" },
      ]),
      PROFILE,
      "a"
    );

    expect(state && written(state)).toStrictEqual([
      { id: "a", query: "   " },
      { id: "a", query: "y" },
    ]);
    expect(state && savedSearches(state, PROFILE)).toStrictEqual([
      { id: "a", query: "y" },
    ]);
  });

  it("changes nothing for an id it does not list", () => {
    const state = stateWith([{ id: "a", query: "x" }]);

    expect(removeSavedSearch(state, PROFILE, "b")).toBeUndefined();
    expect(removeSavedSearch(state, OTHER, "a")).toBeUndefined();
  });
});

describe(savedSearchName, () => {
  it("names a search by its label, else its query", () => {
    expect(
      savedSearchName({ id: "a", query: "is:starred", label: "Stars" })
    ).toBe("Stars");
    expect(savedSearchName({ id: "a", query: "is:starred", label: " " })).toBe(
      "is:starred"
    );
    expect(savedSearchName({ id: "a", query: "is:starred" })).toBe(
      "is:starred"
    );
  });

  it("cuts a long name short by characters, never inside one", () => {
    const name = savedSearchName({ id: "a", query: "😀".repeat(80) });

    expect([...name]).toHaveLength(60);
    expect(name.endsWith("😀…")).toBeTruthy();
  });
});
