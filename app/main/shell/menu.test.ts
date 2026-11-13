import { describe, expect, it } from "vitest";

import { AppEvents } from "../../core/events.ts";
import { commands as channels } from "../../shared/channels/commands.ts";
import { commands } from "../../shared/commands/registry.ts";
import { FakeApp } from "../../test/fakes/app.ts";
import { FakeClock } from "../../test/fakes/clock.ts";
import { FakeFs } from "../../test/fakes/fs.ts";
import { fakeIds } from "../../test/fakes/ids.ts";
import { FakeRegistrar } from "../../test/fakes/registrar.ts";
import { FakeSessions } from "../../test/fakes/session.ts";
import { FakeUpdater } from "../../test/fakes/updater.ts";
import { FakeViewFactory } from "../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { Profiles } from "../features/profiles/index.ts";
import { SettingsStore } from "../features/settings/index.ts";
import { Stages } from "../features/stage/index.ts";
import { Updater } from "../features/updater/index.ts";
import type { MenuAction, MenuSection } from "../platform/menu.ts";
import { CommandDispatcher } from "./commands.ts";
import { ApplicationMenu, buildMenu } from "./menu.ts";

const entriesOf = (section: MenuSection) =>
  section.kind === "role"
    ? []
    : section.entries.filter(
        (entry): entry is MenuAction => entry.kind === "action"
      );

const setup = async (platform = "darwin") => {
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
  const events = new AppEvents();
  const profiles = new Profiles({
    app: new FakeApp(platform),
    clock: new FakeClock(),
    entitlement: { expiresAt: null, kind: "unknown", source: "stored" },
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    onError: () => {
      reports.push("error");
    },
    registrar,
    report: (message) => {
      reports.push(message);
    },
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  const stages = new Stages({
    blankPanes: false,
    commands: dispatcher,
    dragPreload: undefined,
    events,
    onError: () => {
      reports.push("error");
    },
    profiles,
    registrar,
    settings,
    views: new FakeViewFactory(),
  });
  stages.start();
  stages.open(window, () => profiles.currentGroup()?.id);
  const feed = new FakeUpdater();
  new Updater({
    app: new FakeApp(platform),
    clock: new FakeClock(),
    commands: dispatcher,
    events,
    onError: () => {
      reports.push("error");
    },
    registrar,
    settings,
    updater: feed,
  }).attach();
  const built: (readonly MenuSection[])[] = [];
  new ApplicationMenu({
    apply: (sections) => {
      built.push(sections);
    },
    commands,
    dispatcher,
    events,
    platform,
    report: (message) => {
      reports.push(message);
    },
    settings,
  }).start();
  const sections = () => built.at(-1) ?? [];
  const actions = () =>
    sections().flatMap((section) =>
      section.kind === "submenu" && section.label !== "Help"
        ? entriesOf(section)
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
    feed,
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
  it("carries the stage's commands in the View menu, beside the Edit menu, with their default shortcuts", async () => {
    const { actions, sections } = await setup();
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
    expect(sections()[1]).toStrictEqual({ kind: "role", role: "editMenu" });
  });

  it("puts a file menu where there is no app menu, and the update commands in Help", async () => {
    const { sections } = await setup("linux");
    const [first] = sections();
    const help = sections().at(3);
    expect(first).toStrictEqual({ kind: "role", role: "fileMenu" });
    expect(
      help?.kind === "submenu" && {
        ids: entriesOf(help).map((entry) => entry.id),
        label: help.label,
      }
    ).toStrictEqual({
      ids: ["updater.check", "updater.install"],
      label: "Help",
    });
  });

  it("puts the update commands in the app menu on macOS, between About and Services", async () => {
    const { sections } = await setup("darwin");
    const [app] = sections();
    expect(
      app?.kind === "roleSubmenu" &&
        app.entries.map((entry) =>
          entry.kind === "action"
            ? entry.id
            : `${entry.kind}${"role" in entry ? `:${entry.role}` : ""}`
        )
    ).toStrictEqual([
      "role:about",
      "separator",
      "updater.check",
      "updater.install",
      "separator",
      "role:services",
      "separator",
      "role:hide",
      "role:hideOthers",
      "role:unhide",
      "separator",
      "role:quit",
    ]);
  });

  it("enables Restart to update once an update is ready, rebuilding the menu", async () => {
    const { built, feed, sections } = await setup("linux");
    const install = () =>
      sections()
        .flatMap(entriesOf)
        .find((entry) => entry.id === "updater.install")?.enabled;
    expect(install()).toBeFalsy();
    feed.emit({ kind: "downloaded", version: "4.1.0" });
    expect(built).toHaveLength(2);
    expect(install()).toBeTruthy();
  });

  it("runs a command in the window it is for", async () => {
    const { action, window } = await setup();
    action("stage.splitVertical").run(window.contentsId);
    action("stage.splitHorizontal").run(window.contentsId);
    expect(window.childViews()).toHaveLength(3);
    action("stage.closeTab").run(window.contentsId);
    expect(window.childViews()).toHaveLength(2);
  });

  it("reports what it could not do and does nothing without a window", async () => {
    const { action, window, reports } = await setup();
    action("stage.closeTab").run(window.contentsId);
    action("stage.closeTab").run(undefined);
    expect(reports).toStrictEqual(["stage.closeTab: lastPane"]);
  });

  it("rebuilds with the user's shortcuts when they change, and only then", async () => {
    const { actions, built, settings, reports } = await setup();
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

  it("runs a command a page asks for, in the page's window", async () => {
    const { registrar, window } = await setup();
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
      enabled: () => true,
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
