import { describe, expect, it } from "vitest";

import { SEARCH_QUERY_MAX_LENGTH } from "./gmail-hash.ts";
import {
  SAVED_SEARCHES_MAX,
  canSaveSearch,
  removeSavedSearch,
  saveSearch,
  savedSearchName,
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

  it("reads a value that is not a list as none, and keeps it", () => {
    const state = stateWith({ id: "a", query: "x" });

    expect(savedSearches(state, PROFILE)).toStrictEqual([]);
    expect(written(state)).toStrictEqual({ id: "a", query: "x" });
    expect(canSaveSearch(state, PROFILE, "x")).toBeFalsy();
    expect(saveSearch(state, PROFILE, "x", newId)).toBeUndefined();
  });
});

describe(saveSearch, () => {
  it("adds the query, trimmed and unnamed, to the profile's list alone", () => {
    const state = saveSearch(
      stateWith(),
      PROFILE,
      '  subject:"out of office" ',
      () => "new"
    );

    expect(state && savedSearches(state, PROFILE)).toStrictEqual([
      { id: "new", query: 'subject:"out of office"' },
    ]);
    expect(state && savedSearches(state, OTHER)).toStrictEqual([]);
  });

  it("adds after the entries that do not parse, which stay", () => {
    const state = saveSearch(stateWith(["garbage"]), PROFILE, "x", () => "new");

    expect(state && written(state)).toStrictEqual([
      "garbage",
      { id: "new", query: "x" },
    ]);
  });

  it("refuses a query saved already, an empty or overlong one, an unknown profile and a full list", () => {
    const state = stateWith([{ id: "a", query: "x" }]);
    const full = stateWith(
      Array.from({ length: SAVED_SEARCHES_MAX }, (_, index) => ({
        id: `f${index}`,
        query: `q${index}`,
      }))
    );

    expect(
      [
        saveSearch(state, PROFILE, " x ", newId),
        saveSearch(state, PROFILE, "  ", newId),
        saveSearch(
          state,
          PROFILE,
          "a".repeat(SEARCH_QUERY_MAX_LENGTH + 1),
          newId
        ),
        saveSearch(state, "gone", "y", newId),
        saveSearch(full, PROFILE, "y", newId),
      ].every((next) => next === undefined)
    ).toBeTruthy();
    expect(saveSearch(state, OTHER, "x", newId)).toBeDefined();
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
