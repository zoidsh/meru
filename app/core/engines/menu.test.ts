import { describe, expect, it } from "vitest";

import { buildMenu } from "./menu.ts";

describe(buildMenu, () => {
  it("adds edit commands after the platform's own edit items, in order", () => {
    const sections = buildMenu({
      bindings: new Map(),
      commands: [
        {
          id: "stage.splitVertical",
          label: "B",
          menu: { order: 2, section: "edit" },
        },
        {
          id: "stage.closeTab",
          label: "A",
          menu: { order: 1, section: "edit" },
        },
        { id: "stage.splitHorizontal", label: "Hidden" },
      ],
      enabled: () => true,
      labels: {
        edit: "Edit",
        file: "File",
        history: "History",
        profiles: "Profiles",
        view: "View",
      },
      platform: "linux",
      run: () => {
        throw new Error("Nothing is clicked");
      },
    });
    const [, edit, view] = sections;
    expect(
      edit?.kind === "submenu"
        ? edit.entries.map((entry) =>
            entry.kind === "action" ? entry.label : entry.kind
          )
        : edit
    ).toStrictEqual([
      "role",
      "role",
      "separator",
      "role",
      "role",
      "role",
      "role",
      "role",
      "role",
      "separator",
      "A",
      "B",
    ]);
    expect(view).toStrictEqual({ entries: [], kind: "submenu", label: "View" });
  });
});
