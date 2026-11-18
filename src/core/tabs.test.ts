import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { gmailTab, isTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import {
  adjacentTab,
  closeTab,
  openTab,
  selectTab,
  setOpenAtLaunch,
  setPinned,
  updatePages,
} from "./tabs.ts";

const app = (id: string) => findApp(APPS, id) as App;

const tab = (id: string, appId: string): Tab => ({
  id,
  app: appId,
  url: `https://${appId}.google.com/${id}`,
  title: id,
});

const state = (tabs: Tab[], selectedTabId = "gmail"): State => ({
  version: 1,
  profiles: [
    {
      ...newProfile("p", "Default"),
      tabs: [gmailTab(), ...tabs],
      selectedTabId,
    },
    newProfile("q", "Profile 2"),
  ],
  selectedProfileId: "p",
});

/** The profile, with every tab that parsed. */
const tabsOf = (next: State | undefined, profileId = "p") => {
  const profile = next?.profiles.find(
    (candidate) => candidate.id === profileId
  );

  return profile && { ...profile, tabs: profile.tabs.filter(isTab) };
};

const ids = (next: State | undefined) => {
  const profile = tabsOf(next);

  return (
    profile && [profile.tabs.map((each) => each.id), profile.selectedTabId]
  );
};

describe(openTab, () => {
  it("appends a tab of the app at the URL, selected, in that profile only", () => {
    const opened = openTab(
      state([]),
      "p",
      app("calendar"),
      "https://calendar.google.com/r",
      () => "new"
    );

    expect(opened?.tabId).toBe("new");
    expect(ids(opened?.state)).toStrictEqual([["gmail", "new"], "new"]);
    expect(tabsOf(opened?.state)?.tabs[1]).toStrictEqual({
      id: "new",
      app: "calendar",
      url: "https://calendar.google.com/r",
      title: "",
    });
    expect(tabsOf(opened?.state, "q")?.tabs).toHaveLength(1);
  });

  it("opens a second tab of an app that may have more than one", () => {
    const opened = openTab(
      state([tab("c1", "calendar")]),
      "p",
      app("calendar"),
      "https://calendar.google.com/2",
      () => "c2"
    );

    expect(ids(opened?.state)).toStrictEqual([["gmail", "c1", "c2"], "c2"]);
  });

  it("selects and sends a single-instance app's tab to the URL rather than opening another", () => {
    const opened = openTab(
      state([tab("c1", "calendar")], "c1"),
      "p",
      app("gmail"),
      "https://mail.google.com/mail/u/0/#inbox/abc",
      () => "never"
    );

    expect(opened?.tabId).toBe("gmail");
    expect(ids(opened?.state)).toStrictEqual([["gmail", "c1"], "gmail"]);
    expect(tabsOf(opened?.state)?.tabs[0]?.url).toBe(
      "https://mail.google.com/mail/u/0/#inbox/abc"
    );
  });

  it("opens Gmail where it was closed under its own id, unpinned, the key written so it is not read as a Gmail tab from before pinning", () => {
    const closed = {
      ...state([]),
      profiles: [
        { ...newProfile("p", "Default"), tabs: [], selectedTabId: "" },
      ],
    };
    const opened = openTab(
      closed,
      "p",
      app("gmail"),
      "https://mail.google.com/mail/u/0",
      () => "never"
    );

    expect([opened?.tabId, tabsOf(opened?.state)?.tabs]).toStrictEqual([
      "gmail",
      [
        {
          id: "gmail",
          app: "gmail",
          url: "https://mail.google.com/mail/u/0",
          title: "",
          pinned: false,
        },
      ],
    ]);
  });

  it("opens nothing in a profile that is not listed", () => {
    expect(
      openTab(
        state([]),
        "gone",
        app("drive"),
        "https://drive.google.com/",
        () => "x"
      )
    ).toBeUndefined();
  });
});

describe(selectTab, () => {
  it("selects a shown tab, and changes nothing for the selected one, a missing one or one not shown", () => {
    const three = state([tab("c1", "calendar"), tab("t9", "tasks")]);

    expect(
      ids(selectTab(three, { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "c1", "t9"], "c1"]);
    expect(
      selectTab(three, { profileId: "p", tabId: "gmail" })
    ).toBeUndefined();
    expect(selectTab(three, { profileId: "p", tabId: "gone" })).toBeUndefined();
    expect(selectTab(three, { profileId: "p", tabId: "t9" })).toBeUndefined();
  });
});

const three = (selected: string) =>
  state([tab("c1", "calendar"), tab("d1", "drive")], selected);

describe(closeTab, () => {
  it("never closes a pinned tab, and closes Gmail's once it is unpinned", () => {
    const gmail = { profileId: "p", tabId: "gmail" };

    expect([
      closeTab(three("gmail"), gmail),
      ids(closeTab(setPinned(three("gmail"), gmail, false) as State, gmail)),
    ]).toStrictEqual([undefined, [["c1", "d1"], "c1"]]);
  });

  it("leaves no tab selected when it closes the only one", () => {
    const only = {
      ...state([], "c1"),
      profiles: [
        {
          ...newProfile("p", "Default"),
          tabs: [tab("c1", "calendar")],
          selectedTabId: "c1",
        },
      ],
    };

    expect(ids(closeTab(only, { profileId: "p", tabId: "c1" }))).toStrictEqual([
      [],
      "",
    ]);
  });

  it("selects the tab to the right of the selected one it closes, or to the left when it was last", () => {
    expect(
      ids(closeTab(three("c1"), { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "d1"], "d1"]);
    expect(
      ids(closeTab(three("d1"), { profileId: "p", tabId: "d1" }))
    ).toStrictEqual([["gmail", "c1"], "c1"]);
  });

  it("leaves the selection alone when another tab closes", () => {
    expect(
      ids(closeTab(three("d1"), { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "d1"], "d1"]);
  });

  it("skips a tab that is not shown when choosing the next", () => {
    const hidden = state([tab("c1", "calendar"), tab("t9", "tasks")], "c1");

    expect(
      ids(closeTab(hidden, { profileId: "p", tabId: "c1" }))
    ).toStrictEqual([["gmail", "t9"], "gmail"]);
  });
});

describe(setPinned, () => {
  it("pins and unpins a shown tab, leaving its Open at Launch as it is", () => {
    const key = { profileId: "p", tabId: "c1" };
    const pinned = setPinned(
      state([{ ...tab("c1", "calendar"), openAtLaunch: true }]),
      key,
      true
    );
    const unpinned = pinned && setPinned(pinned, key, false);

    expect(
      [pinned, unpinned].map((next) =>
        tabsOf(next)?.tabs.find((candidate) => candidate.id === "c1")
      )
    ).toStrictEqual([
      { ...tab("c1", "calendar"), openAtLaunch: true, pinned: true },
      { ...tab("c1", "calendar"), openAtLaunch: true, pinned: false },
    ]);
  });

  it("changes nothing for a tab that already reads so or is not shown", () => {
    const before = state([tab("c1", "calendar"), tab("t9", "tasks")]);

    expect([
      setPinned(before, { profileId: "p", tabId: "gmail" }, true),
      setPinned(before, { profileId: "p", tabId: "c1" }, false),
      setPinned(before, { profileId: "p", tabId: "t9" }, true),
    ]).toStrictEqual([undefined, undefined, undefined]);
  });
});

describe(setOpenAtLaunch, () => {
  it("switches a pinned tab's Open at Launch, and nothing for a tab that is not pinned", () => {
    const before = state([tab("c1", "calendar")]);
    const off = setOpenAtLaunch(
      before,
      { profileId: "p", tabId: "gmail" },
      false
    );

    expect([
      tabsOf(off)?.tabs[0],
      setOpenAtLaunch(before, { profileId: "p", tabId: "gmail" }, true),
      setOpenAtLaunch(before, { profileId: "p", tabId: "c1" }, true),
    ]).toStrictEqual([
      { ...gmailTab(), openAtLaunch: false },
      undefined,
      undefined,
    ]);
  });
});

describe(updatePages, () => {
  it("keeps each tab's latest URL and title, and nothing when none of it is news", () => {
    const before = state([tab("c1", "calendar")]);
    const next = updatePages(before, [
      { profileId: "p", tabId: "c1", url: "https://calendar.google.com/week" },
      { profileId: "p", tabId: "gmail", title: "Inbox (2)" },
      { profileId: "p", tabId: "gone", title: "Nobody" },
    ]);

    expect(
      tabsOf(next)?.tabs.map(({ url, title }) => [url, title])
    ).toStrictEqual([
      ["https://mail.google.com/mail/u/0", "Inbox (2)"],
      ["https://calendar.google.com/week", "c1"],
    ]);
    expect(
      updatePages(before, [{ profileId: "p", tabId: "c1", title: "c1" }])
    ).toBeUndefined();
    expect(updatePages(before, [])).toBeUndefined();
  });
});

describe(adjacentTab, () => {
  it("is the next or previous shown tab of the selected profile, wrapping round", () => {
    expect(adjacentTab(three("gmail"), 1)).toStrictEqual({
      profileId: "p",
      tabId: "c1",
    });
    expect(adjacentTab(three("d1"), 1)?.tabId).toBe("gmail");
    expect(adjacentTab(three("gmail"), -1)?.tabId).toBe("d1");
    expect(adjacentTab(three("c1"), -1)?.tabId).toBe("gmail");
  });

  it("skips a tab of an app this build does not know", () => {
    expect(
      adjacentTab(state([tab("x1", "later"), tab("c1", "calendar")]), 1)?.tabId
    ).toBe("c1");
  });

  it("is nothing when Gmail's is the only tab", () => {
    expect(adjacentTab(state([]), 1)).toBeUndefined();
  });
});
