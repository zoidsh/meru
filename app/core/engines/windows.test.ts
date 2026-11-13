import { describe, expect, it } from "vitest";

import type { ProfilesState } from "../records/profiles-state.ts";
import type { Tab } from "../records/tab.ts";
import type { Window } from "../records/window.ts";
import { mainGroupOf } from "./windows.ts";

const tab = (id: string, profileId: string): Tab => ({
  appId: "gmail",
  health: "ok",
  id,
  pinned: false,
  profileId,
  sleeping: false,
  title: "Gmail",
  url: "https://mail.google.com/",
  zoom: 1,
});

const group = (id: string, profileId: string, tabId: string) => ({
  id,
  layout: { kind: "leaf" as const, paneId: `pane-${tabId}`, tabIds: [tabId] },
  profileId,
  tabIds: [tabId],
});

const state: ProfilesState = {
  groups: [
    group("g1", "p1", "t1"),
    group("g2", "p1", "t2"),
    group("g3", "p2", "t3"),
  ],
  profiles: [
    { id: "p1", label: "Personal", order: 0, status: { kind: "ok" } },
    { id: "p2", label: "Work", order: 1, status: { kind: "ok" } },
  ],
  selectedProfileId: "p1",
  tabs: [tab("t1", "p1"), tab("t2", "p1"), tab("t3", "p2")],
};

const showing = (groupId: string): Window[] => [
  {
    bounds: { height: 600, width: 800, x: 0, y: 0 },
    groupId,
    id: "w",
    kind: "main",
  },
];

describe(mainGroupOf, () => {
  it("keeps the group the main window showed while it belongs to the selected profile", () => {
    expect(mainGroupOf(showing("g2"), state)).toBe("g2");
  });

  it("falls back to the selected profile's first group for another profile's group, a gone one or no window", () => {
    expect([
      mainGroupOf(showing("g3"), state),
      mainGroupOf(showing("gone"), state),
      mainGroupOf([], state),
    ]).toStrictEqual(["g1", "g1", "g1"]);
  });
});
