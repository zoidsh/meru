import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import { planViews } from "./views.ts";

const tab = (id: string, app = "calendar"): Tab => ({
  id,
  app,
  url: "",
  title: "",
});

const state: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [gmailTab(), tab("a1"), tab("a2", "tasks")],
      selectedTabId: "a1",
    },
    { ...newProfile("b", "Profile 2"), tabs: [gmailTab(), tab("b1")] },
    newProfile("c", "Profile 3"),
  ],
  selectedProfileId: "a",
};

const keys = (plan: ReturnType<typeof planViews>) =>
  plan.views.map(({ profileId, tabId }) => `${profileId}/${tabId}`);

describe(planViews, () => {
  it("gives only the selected profile's selected tab a view at first", () => {
    const plan = planViews(state, []);

    expect(keys(plan)).toStrictEqual(["a/a1"]);
    expect(plan.front).toStrictEqual({ profileId: "a", tabId: "a1" });
  });

  it("keeps the views tabs have, in the order of profiles and tabs, with the selected tab in front", () => {
    const plan = planViews({ ...state, selectedProfileId: "b" }, [
      "a/a1",
      "b/b1",
      "a/gmail",
    ]);

    expect(keys(plan)).toStrictEqual(["a/gmail", "a/a1", "b/gmail", "b/b1"]);
    expect(plan.front).toStrictEqual({ profileId: "b", tabId: "gmail" });
  });

  it("drops the view of a closed tab and of every tab of a removed profile", () => {
    const plan = planViews(
      {
        ...state,
        profiles: [
          { ...newProfile("a", "Default"), selectedTabId: "gmail" },
          newProfile("c", "Profile 3"),
        ],
      },
      ["a/a1", "a/gmail", "b/gmail", "b/b1"]
    );

    expect(keys(plan)).toStrictEqual(["a/gmail"]);
  });

  it("never gives a tab of an app this build does not know a view", () => {
    expect(keys(planViews(state, ["a/a2"]))).toStrictEqual(["a/a1"]);
  });
});
