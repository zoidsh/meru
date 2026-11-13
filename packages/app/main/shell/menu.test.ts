import { describe, expect, it } from "vitest";

import { leaf } from "../../core/engines/layout.ts";
import { commands as channels } from "../../shared/channels/commands.ts";
import { commands } from "../../shared/commands/registry.ts";
import { FakeApp } from "../../test/fakes/app.ts";
import { FakeClock } from "../../test/fakes/clock.ts";
import { FakeFs } from "../../test/fakes/fs.ts";
import { fakeIds } from "../../test/fakes/ids.ts";
import { FakeRegistrar } from "../../test/fakes/registrar.ts";
import { FakeViewFactory } from "../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { SettingsStore } from "../features/settings/index.ts";
import { Stages } from "../features/stage/index.ts";
import type { MenuAction, MenuSection } from "../platform/menu.ts";
import { CommandDispatcher } from "./commands.ts";
import { ApplicationMenu, buildMenu } from "./menu.ts";

const setup = (platform = "darwin") => {
  const window = new FakeWindow();
  const reports: string[] = [];
  const registrar = new FakeRegistrar();
  const settings = new SettingsStore({
    app: new FakeApp(),
    clock: new FakeClock(),
    fs: new FakeFs(),
    onError: (error) => {
      reports.push(String(error));
    },
    onFallback: () => {
      reports.push("fallback");
    },
    registrar,
    watchFile: false,
  });
  const dispatcher = new CommandDispatcher();
  dispatcher.start(registrar);
  const stages = new Stages({
    commands: dispatcher,
    dragPreload: undefined,
    ids: fakeIds(),
    onError: () => {
      reports.push("error");
    },
    registrar,
    settings,
    views: new FakeViewFactory(),
  });
  stages.start();
  stages.open(
    window,
    { id: "g1", layout: leaf("p1", "t1"), profileId: "dev", tabIds: ["t1"] },
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
  const built: (readonly MenuSection[])[] = [];
  new ApplicationMenu({
    apply: (sections) => {
      built.push(sections);
    },
    commands,
    dispatcher,
    platform,
    report: (message) => {
      reports.push(message);
    },
    settings,
  }).start();
  const sections = () => built.at(-1) ?? [];
  const actions = () =>
    sections().flatMap((section) =>
      section.kind === "submenu"
        ? section.entries.filter(
            (entry): entry is MenuAction => entry.kind === "action"
          )
        : []
    );
  const action = (id: string) => {
    const found = actions().find((candidate) => candidate.id === id);
    if (found === undefined) {
      throw new Error(`No menu action ${id}`);
    }
    return found;
  };
  return {
    action,
    actions,
    built,
    registrar,
    reports,
    sections,
    settings,
    window,
  };
};

const shortcuts = (actions: readonly MenuAction[]) =>
  actions.map(({ id, accelerator }) => [id, accelerator]);

describe(ApplicationMenu, () => {
  it("carries the stage's commands in the View menu, beside the Edit menu, with their default shortcuts", () => {
    const { actions, sections } = setup();
    expect(
      actions().map(({ id, accelerator, label }) => ({
        accelerator,
        id,
        label,
      }))
    ).toStrictEqual([
      {
        accelerator: "CommandOrControl+Alt+N",
        id: "stage.splitVertical",
        label: "Split vertically",
      },
      {
        accelerator: "CommandOrControl+Alt+Shift+N",
        id: "stage.splitHorizontal",
        label: "Split horizontally",
      },
      {
        accelerator: "CommandOrControl+Shift+W",
        id: "stage.closeTab",
        label: "Close tab",
      },
      {
        accelerator: "CommandOrControl+Alt+.",
        id: "stage.focusNext",
        label: "Focus next pane",
      },
      {
        accelerator: "CommandOrControl+Alt+,",
        id: "stage.focusPrevious",
        label: "Focus previous pane",
      },
    ]);
    expect(sections().slice(0, 2)).toStrictEqual([
      { kind: "role", role: "appMenu" },
      { kind: "role", role: "editMenu" },
    ]);
  });

  it("puts a file menu where there is no app menu", () => {
    expect(setup("linux").sections()[0]).toStrictEqual({
      kind: "role",
      role: "fileMenu",
    });
  });

  it("runs a command in the window it is for", () => {
    const { action, window } = setup();
    action("stage.splitVertical").run(window.contentsId);
    action("stage.splitHorizontal").run(window.contentsId);
    expect(window.childViews()).toHaveLength(3);
    action("stage.closeTab").run(window.contentsId);
    expect(window.childViews()).toHaveLength(2);
  });

  it("reports what it could not do and does nothing without a window", () => {
    const { action, window, reports } = setup();
    action("stage.closeTab").run(window.contentsId);
    action("stage.closeTab").run(undefined);
    expect(reports).toStrictEqual(["stage.closeTab: lastPane"]);
  });

  it("rebuilds with the user's shortcuts when they change, and only then", () => {
    const { actions, built, settings, reports } = setup();
    settings.set("stage.zoom", 2);
    expect(built).toHaveLength(1);
    settings.set("shortcuts.bindings", {
      "stage.closeTab": null,
      "stage.splitVertical": "Alt+CmdOrCtrl+V",
    });
    expect(built).toHaveLength(2);
    expect(shortcuts(actions())).toStrictEqual([
      ["stage.splitVertical", "CommandOrControl+Alt+V"],
      ["stage.splitHorizontal", "CommandOrControl+Alt+Shift+N"],
      ["stage.closeTab", undefined],
      ["stage.focusNext", "CommandOrControl+Alt+."],
      ["stage.focusPrevious", "CommandOrControl+Alt+,"],
    ]);
    settings.set("shortcuts.bindings", {
      "stage.splitHorizontal": "Cmd+V",
      "stage.splitVertical": "CmdOrCtrl+V",
    });
    expect(reports).toStrictEqual([
      "stage.splitHorizontal and stage.splitVertical share Command+V",
    ]);
  });

  it("runs a command a page asks for, in the page's window", () => {
    const { registrar, window } = setup();
    expect(
      registrar.call(
        channels.run,
        { id: "stage.splitVertical" },
        window.contentsId
      )
    ).toStrictEqual({ ok: true, value: null });
    expect(window.childViews()).toHaveLength(2);
    expect(
      registrar.call(channels.run, { id: "stage.closeTab" }, -1)
    ).toStrictEqual({ error: "unknownWindow", ok: false });
  });
});

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
