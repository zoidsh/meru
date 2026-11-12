import { describe, expect, it } from "vitest";

import { leaf } from "../../core/engines/layout.ts";
import { FakeApp } from "../../test/fakes/app.ts";
import { FakeClock } from "../../test/fakes/clock.ts";
import { FakeFs } from "../../test/fakes/fs.ts";
import { fakeIds } from "../../test/fakes/ids.ts";
import { FakeRegistrar } from "../../test/fakes/registrar.ts";
import { FakeViewFactory } from "../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { SettingsStore } from "../features/settings/index.ts";
import { Stages } from "../features/stage/index.ts";
import { buildMenu, MENU_IDS } from "./menu.ts";

const setup = (platform = "darwin") => {
  const window = new FakeWindow();
  const failures: string[] = [];
  const stages = new Stages({
    dragPreload: undefined,
    e2e: false,
    ids: fakeIds(),
    onError: () => {
      failures.push("error");
    },
    registrar: new FakeRegistrar(),
    settings: new SettingsStore({
      app: new FakeApp(),
      clock: new FakeClock(),
      fs: new FakeFs(),
      onError: (error) => {
        failures.push(String(error));
      },
      onFallback: () => {
        failures.push("fallback");
      },
      registrar: new FakeRegistrar(),
      watchFile: false,
    }),
    views: new FakeViewFactory(),
  });
  stages.open(
    window,
    {
      id: "g1",
      layout: leaf("p1", "t1"),
      profileId: "dev",
      tabIds: ["t1"],
    },
    [
      {
        appId: "gmail",
        health: "ok",
        id: "t1",
        pinned: false,
        profileId: "dev",
        sleeping: false,
        title: "Gmail",
        url: "https://mail.google.com/",
        zoom: 1,
      },
    ]
  );
  const sections = buildMenu({
    onFailure: (action, error) => {
      failures.push(`${action}: ${error}`);
    },
    platform,
    stages,
  });
  const actions = sections.flatMap((section) =>
    section.kind === "submenu" ? section.entries : []
  );
  const action = (id: string) => {
    const found = actions.find((candidate) => candidate.id === id);
    if (found === undefined) {
      throw new Error(`No menu action ${id}`);
    }
    return found;
  };
  return { action, actions, failures, sections, window };
};

describe(buildMenu, () => {
  it("carries the pane shortcuts in the View menu, beside the Edit menu", () => {
    const { actions, sections } = setup();
    expect(
      actions.map(({ accelerator, label }) => ({ accelerator, label }))
    ).toStrictEqual([
      { accelerator: "CommandOrControl+D", label: "Split vertically" },
      { accelerator: "CommandOrControl+Shift+D", label: "Split horizontally" },
      { accelerator: "CommandOrControl+W", label: "Close pane" },
    ]);
    expect(sections.slice(0, 2)).toStrictEqual([
      { kind: "role", role: "appMenu" },
      { kind: "role", role: "editMenu" },
    ]);
  });

  it("puts a file menu where there is no app menu", () => {
    expect(setup("linux").sections[0]).toStrictEqual({
      kind: "role",
      role: "fileMenu",
    });
  });

  it("splits and closes panes in the window it is for", () => {
    const { action, window } = setup();
    action(MENU_IDS.splitVertically).run(window.contentsId);
    action(MENU_IDS.splitHorizontally).run(window.contentsId);
    expect(window.childViews()).toHaveLength(3);
    action(MENU_IDS.closePane).run(window.contentsId);
    expect(window.childViews()).toHaveLength(2);
  });

  it("reports what it could not do and does nothing without a window", () => {
    const { action, window, failures } = setup();
    action(MENU_IDS.closePane).run(window.contentsId);
    action(MENU_IDS.closePane).run(undefined);
    expect(failures).toStrictEqual(["close-pane: lastPane"]);
  });
});
