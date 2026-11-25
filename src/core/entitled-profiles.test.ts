import { describe, expect, it } from "vitest";

import { APPS } from "./apps.ts";
import {
  entitledState,
  entitledView,
  lockedProfiles,
  storedAfter,
  storedAfterView,
} from "./entitled-profiles.ts";
import type { StateGrants } from "./entitled-profiles.ts";
import { savedSearches } from "./saved-searches.ts";
import {
  decodeState,
  encodeState,
  isAsleep,
  isDisabled,
  newProfile,
  renameProfile,
  selectProfile,
} from "./state.ts";
import type { State } from "./state.ts";
import { openTab } from "./tabs.ts";

const stored = (): State => {
  const decoded = decodeState({
    version: 1,
    profiles: [
      { ...newProfile("personal", "Personal"), asleep: true, disabled: true },
      "not a profile",
      { ...newProfile("work", "Work"), color: "green", later: { kept: 1 } },
      newProfile("home", "Home"),
    ],
    selectedProfileId: "work",
    profilesToClear: ["gone"],
  });

  if (decoded.kind !== "read") {
    throw new Error("The fixture does not decode");
  }

  return decoded.value;
};

describe(entitledState, () => {
  it("is the stored state itself when more than one profile is allowed", () => {
    const state = stored();

    expect(entitledState(state, true)).toBe(state);
  });

  it("is the stored state itself with one profile, allowed or not", () => {
    const state = { ...stored(), profiles: stored().profiles.slice(0, 1) };

    expect(entitledState(state, false)).toBe(state);
  });

  it("holds the first profile alone, selected whichever the file selects, awake and enabled", () => {
    const view = entitledState(stored(), false);
    const [first] = view.profiles;

    expect(view.profiles.map(({ id }) => id)).toStrictEqual(["personal"]);
    expect(view.selectedProfileId).toBe("personal");
    expect(
      first && [isAsleep(view, first), isDisabled(view, first)]
    ).toStrictEqual([false, false]);
  });
});

describe(lockedProfiles, () => {
  it("lists the profiles the free version leaves out, in their order", () => {
    expect(lockedProfiles(stored(), false).map(({ id }) => id)).toStrictEqual([
      "work",
      "home",
    ]);
    expect(lockedProfiles(stored(), true)).toStrictEqual([]);
  });
});

describe(storedAfter, () => {
  it("writes back a change made while free with every other profile and the stored selection as found", () => {
    const state = stored();
    const view = entitledState(state, false);
    const renamed = renameProfile(view, "personal", "Mine");
    const app = APPS.find((candidate) => !candidate.singleInstance);
    const opened =
      renamed &&
      app &&
      openTab(renamed, "personal", app, app.home, () => "new");

    if (!opened) {
      throw new Error("The change did nothing");
    }

    const written = encodeState(storedAfter(state, view, opened.state)) as {
      profiles: { id?: string; name?: string }[];
      selectedProfileId: string;
      profilesToClear: unknown;
    };
    const before = encodeState(state) as typeof written;

    expect(written.selectedProfileId).toBe("work");
    expect(written.profilesToClear).toStrictEqual(["gone"]);
    expect(written.profiles[0]?.name).toBe("Mine");
    expect(written.profiles.slice(1)).toStrictEqual(before.profiles.slice(1));
  });

  it("keeps the first profile's stored sleep and disabled keys through a write while free", () => {
    const state = stored();
    const view = entitledState(state, false);
    const next = renameProfile(view, "personal", "Mine");
    const written = next && storedAfter(state, view, next);

    expect(written?.profiles[0]).toMatchObject({
      asleep: true,
      disabled: true,
    });
  });

  it("is the change itself when the view is the stored state", () => {
    const state = stored();
    const next = selectProfile(state, "home");

    expect(next && storedAfter(state, state, next)).toBe(next);
  });
});

const ALL: StateGrants = {
  profiles: true,
  notificationGates: true,
  savedSearches: true,
};

describe(entitledView, () => {
  it("is the stored state itself with every grant", () => {
    const state = { ...stored(), doNotDisturb: { until: null } };

    expect(entitledView(state, ALL)).toBe(state);
  });

  it("holds no Do Not Disturb without notificationGates, and writes the stored one back as found, one that does not parse included", () => {
    const grants = { ...ALL, notificationGates: false };
    const parsed = { ...stored(), doNotDisturb: { until: null } };
    const decoded = decodeState({
      ...(encodeState(stored()) as object),
      doNotDisturb: "not one",
    });

    if (decoded.kind !== "read") {
      throw new Error("The fixture does not decode");
    }

    const unparsed = decoded.value;
    const write = (state: State) => {
      const next = selectProfile(entitledView(state, grants), "home");

      return next && encodeState(storedAfterView(state, grants, next));
    };

    expect([
      entitledView(parsed, grants).doNotDisturb,
      write(parsed),
      write(unparsed),
    ]).toStrictEqual([
      undefined,
      expect.objectContaining({ doNotDisturb: { until: null } }),
      expect.objectContaining({ doNotDisturb: "not one" }),
    ]);
  });

  it("holds no saved searches without savedSearches, and writes each profile's back as found, in its place", () => {
    const grants = { ...ALL, savedSearches: false };
    const searches = [{ id: "s", query: "is:starred" }, "not a search"];
    const decoded = decodeState({
      version: 1,
      profiles: [
        { id: "a", name: "A", savedSearches: searches, color: "green" },
        { id: "b", name: "B" },
      ],
      selectedProfileId: "a",
    });

    if (decoded.kind !== "read") {
      throw new Error("The fixture does not decode");
    }

    const state = decoded.value;
    const view = entitledView(state, grants);
    const next = renameProfile(view, "a", "Mine");
    const renamedStored = renameProfile(state, "a", "Mine");

    expect([
      savedSearches(view, "a"),
      next && JSON.stringify(encodeState(storedAfterView(state, grants, next))),
    ]).toStrictEqual([
      [],
      renamedStored && JSON.stringify(encodeState(renamedStored)),
    ]);
  });
});
