import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { gmailTab, isTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import { closeTab, openTab, selectTab, updatePages } from "./tabs.ts";

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
  it("never closes Gmail's tab", () => {
    expect(
      closeTab(three("gmail"), { profileId: "p", tabId: "gmail" })
    ).toBeUndefined();
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
