import { describe, expect, it } from "vitest";

import { APPS } from "./apps.ts";
import { bookmarks } from "./bookmarks.ts";
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
  isTab,
  newProfile,
  renameProfile,
  selectProfile,
  setCheckMail,
} from "./state.ts";
import type { State } from "./state.ts";
import { openTab, updatePages } from "./tabs.ts";

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
  workspaceApps: true,
  splitView: true,
  bookmarks: true,
};

const FREE: StateGrants = {
  profiles: false,
  notificationGates: false,
  savedSearches: false,
  workspaceApps: false,
  splitView: false,
  bookmarks: false,
};

const half = (a: string, b: string) => ({
  root: {
    direction: "row",
    children: [
      { size: 0.5, pane: a },
      { size: 0.5, pane: b },
    ],
  },
});

/** A profile of a trial's: several tabs, a pin, a split, a bookmark and an entry this build cannot read. */
const workspace = (gmail: Record<string, unknown> | null = {}) => {
  const decoded = decodeState({
    version: 1,
    profiles: [
      {
        id: "p",
        name: "Personal",
        tabs: [
          {
            id: "cal",
            app: "calendar",
            url: "https://calendar.google.com/",
            title: "Calendar",
            pinned: true,
          },
          ...(gmail
            ? [
                {
                  id: "gmail",
                  app: "gmail",
                  url: "https://mail.google.com/mail/u/0/",
                  title: "Inbox",
                  pinned: true,
                  ...gmail,
                },
              ]
            : []),
          {
            id: "d1",
            app: "drive",
            url: "https://drive.google.com/",
            title: "Drive",
            sleepWhenIdle: true,
          },
          {
            id: "d2",
            app: "drive",
            url: "https://drive.google.com/2",
            title: "Drive 2",
          },
          "not a tab",
        ],
        selectedTabId: "d1",
        splits: [half("d1", "d2")],
        bookmarks: [
          {
            id: "b",
            url: "https://docs.google.com/x",
            title: "Doc",
            app: "docs",
          },
        ],
      },
      newProfile("work", "Work"),
    ],
    selectedProfileId: "p",
  });

  if (decoded.kind !== "read") {
    throw new Error("The fixture does not decode");
  }

  return decoded.value;
};

describe("the free version's tabs", () => {
  it("shows each profile's Gmail tab alone, selected and in the main window, with no split or bookmark", () => {
    const view = entitledView(
      workspace({ pinned: false, ownWindow: true }),
      FREE
    );
    const [profile] = view.profiles;

    expect(view.profiles).toHaveLength(1);
    expect(profile?.tabs).toStrictEqual([
      {
        id: "gmail",
        app: "gmail",
        url: "https://mail.google.com/mail/u/0/",
        title: "Inbox",
        pinned: false,
      },
    ]);
    expect(profile?.selectedTabId).toBe("gmail");
    expect(profile?.splits).toStrictEqual([]);
    expect(view && bookmarks(view, "p")).toStrictEqual([]);
  });

  it("writes back every hidden tab, pin, Sleep When Idle mark, split and bookmark as stored through a Gmail navigation, a rename and Check mail", () => {
    const state = workspace();
    const view = entitledView(state, FREE);
    const navigated = updatePages(view, [
      {
        profileId: "p",
        tabId: "gmail",
        url: "https://mail.google.com/mail/u/0/#starred",
        title: "Starred",
      },
    ]);
    const renamed = navigated && renameProfile(navigated, "p", "Mine");
    const unchecked = renamed && setCheckMail(renamed, "p", false);

    if (!unchecked) {
      throw new Error("A change did nothing");
    }

    const written = storedAfterView(state, FREE, unchecked);
    const expected = setCheckMail(
      renameProfile(
        updatePages(state, [
          {
            profileId: "p",
            tabId: "gmail",
            url: "https://mail.google.com/mail/u/0/#starred",
            title: "Starred",
          },
        ]) ?? state,
        "p",
        "Mine"
      ) ?? state,
      "p",
      false
    );

    expect(JSON.stringify(encodeState(written))).toBe(
      JSON.stringify(expected && encodeState(expected))
    );
  });

  it("keeps the Gmail tab's stored own window through a write", () => {
    const state = workspace({ pinned: false, ownWindow: true });
    const next = updatePages(entitledView(state, FREE), [
      { profileId: "p", tabId: "gmail", title: "Starred" },
    ]);
    const written = next && storedAfterView(state, FREE, next);

    expect(written?.profiles[0]?.tabs[1]).toMatchObject({
      title: "Starred",
      ownWindow: true,
    });
  });

  it("shows a new Gmail tab for a profile with none, and never writes it", () => {
    const state = workspace(null);
    const view = entitledView(state, FREE);
    const next = updatePages(view, [
      { profileId: "p", tabId: "gmail", title: "Inbox" },
    ]);
    const written = next && storedAfterView(state, FREE, next);

    expect(
      view.profiles[0]?.tabs.map((tab) => isTab(tab) && tab.app)
    ).toStrictEqual(["gmail"]);
    expect(written && JSON.stringify(encodeState(written))).toBe(
      JSON.stringify(encodeState(state))
    );
  });

  it("brings back the tabs in their order, the selection, the split and the bookmark once raised", () => {
    const state = workspace();
    const next = updatePages(entitledView(state, FREE), [
      { profileId: "p", tabId: "gmail", title: "Starred" },
    ]);
    const written = next && storedAfterView(state, FREE, next);
    const raised = written && entitledView(written, ALL);
    const [profile] = raised?.profiles ?? [];

    expect(
      profile?.tabs.map((tab) => (isTab(tab) ? tab.id : "unread"))
    ).toStrictEqual(["cal", "gmail", "d1", "d2", "unread"]);
    expect(profile?.selectedTabId).toBe("d1");
    expect(profile?.splits).toHaveLength(1);
    expect(raised && bookmarks(raised, "p").map(({ id }) => id)).toStrictEqual([
      "b",
    ]);
    expect(raised?.profiles.map(({ id }) => id)).toStrictEqual(["p", "work"]);
  });

  it("hides only the splits without splitView, written back as stored", () => {
    const grants = { ...ALL, splitView: false };
    const state = workspace();
    const view = entitledView(state, grants);
    const next = renameProfile(view, "p", "Mine");
    const written = next && storedAfterView(state, grants, next);

    expect(view.profiles[0]?.tabs).toHaveLength(5);
    expect(view.profiles[0]?.splits).toStrictEqual([]);
    expect(written?.profiles[0]?.splits).toStrictEqual(
      state.profiles[0]?.splits
    );
  });
});

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
