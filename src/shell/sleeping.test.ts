import { describe, expect, it } from "vitest";

import type { ShellState } from "#contract/shell.ts";

import { sleepingSelectedTab } from "./sleeping.ts";

const tabs = (selectedAsleep: boolean): ShellState["tabs"] => ({
  profileId: "a",
  selectedTabId: "s",
  selectedAsleep,
  panes: null,
  box: null,
  tabs: [
    {
      id: "o",
      app: "calendar",
      title: "",
      pinned: false,
      status: { kind: "unloaded" },
    },
    {
      id: "s",
      app: "gmail",
      title: "Inbox",
      pinned: true,
      status: { kind: "unloaded" },
    },
  ],
});

describe(sleepingSelectedTab, () => {
  it("is the selected tab while main says it was put to sleep, and nothing for one selected while unloaded", () => {
    expect([
      sleepingSelectedTab(tabs(true))?.id,
      sleepingSelectedTab(tabs(false)),
    ]).toStrictEqual(["s", undefined]);
  });
});
