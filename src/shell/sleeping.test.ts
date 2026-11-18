import { describe, expect, it } from "vitest";

import type { ShellState } from "#contract/shell.ts";

import { sleepingSelectedTab } from "./sleeping.ts";

type Status = ShellState["tabs"]["tabs"][number]["status"];

const tabs = (selected: Status) => ({
  profileId: "a",
  selectedTabId: "s",
  tabs: [
    {
      id: "o",
      app: "calendar",
      title: "",
      pinned: false,
      status: { kind: "unloaded" as const },
    },
    { id: "s", app: "gmail", title: "Inbox", pinned: true, status: selected },
  ],
});

describe(sleepingSelectedTab, () => {
  it("is the selected tab while it has no page, and nothing while it has one, failed or crashed", () => {
    expect(
      (
        [
          { kind: "unloaded" },
          { kind: "loading" },
          { kind: "live" },
          { kind: "failed", reason: "ERR_FAILED", retrying: false },
          { kind: "crashed" },
        ] as const
      ).map((status) => sleepingSelectedTab(tabs(status))?.id)
    ).toStrictEqual(["s", undefined, undefined, undefined, undefined]);
  });

  it("is nothing with no tab selected, whatever the others are", () => {
    expect(
      sleepingSelectedTab({ ...tabs({ kind: "live" }), selectedTabId: "" })
    ).toBeUndefined();
  });
});
