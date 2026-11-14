import { describe, expect, it } from "vitest";

import { AppEvents } from "../../core/events.ts";
import type {
  MenuAction,
  MenuEntry,
  MenuSection,
} from "../../core/records/menu.ts";
import { commands as channels } from "../../shared/channels/commands.ts";
import { wireName } from "../../shared/channels/define.ts";
import { chromeSurface } from "../../shared/channels/surfaces.ts";
import { commands } from "../../shared/commands/registry.ts";
import type { CommandId } from "../../shared/commands/registry.ts";
import { FakeClock } from "../../test/fakes/clock.ts";
import { FakeFs } from "../../test/fakes/fs.ts";
import { fakeIds } from "../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../test/fakes/lifecycle.ts";
import { FakeLog } from "../../test/fakes/log.ts";
import { FakeSessions } from "../../test/fakes/session.ts";
import { FakeUpdater } from "../../test/fakes/updater.ts";
import { FakeViewFactory } from "../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { Profiles } from "../features/profiles/index.ts";
import { SettingsStore } from "../features/settings/index.ts";
import { Stages } from "../features/stage/index.ts";
import { Updater } from "../features/updater/index.ts";
import { CommandDispatcher } from "./commands.ts";
import { IpcDispatcher } from "./ipc.ts";
import { ShortcutKeys } from "./keys.ts";
import { ApplicationMenu } from "./menu.ts";

const entriesOf = (section: MenuSection<CommandId>) =>
  section.kind === "role"
    ? []
    : section.entries.filter(
        (entry): entry is MenuAction<CommandId> => entry.kind === "action"
      );

const setup = async (platform = "darwin") => {
  const window = new FakeWindow();
  const log = new FakeLog();
  const registrar = new IpcDispatcher({
    log: log.scoped("ipc"),
    transport: new FakeIpcTransport(),
  });
  const settings = new SettingsStore({
    entitlement: () => ({ expiresAt: null, kind: "unknown", source: "stored" }),
    events: new AppEvents(),
    lifecycle: new FakeLifecycle(),
    clock: new FakeClock(),
    fs: new FakeFs(),
    log: log.scoped("settings"),
    registrar,
    watchFile: false,
  });
  const dispatcher = new CommandDispatcher();
  dispatcher.start(registrar);
  registrar.assign(window.contentsId, chromeSurface);
  registrar.assign(-1, chromeSurface);
  const events = new AppEvents();
  const profiles = new Profiles({
    commands: dispatcher,
    lifecycle: new FakeLifecycle(platform),
    clock: new FakeClock(),
    entitlement: { expiresAt: null, kind: "unknown", source: "stored" },
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    log: log.scoped("profiles"),
    registrar,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  profiles.start();
  const stages = new Stages({
    onOpen: () => false,
    onPopup: () => true,
    keys: new ShortcutKeys({
      commands,
      dispatcher,
      platform: "darwin",
      log: log.scoped("keys"),
      settings,
    }),
    blankPanes: false,
    commands: dispatcher,
    dragPreload: undefined,
    overlayPreload: undefined,
    events,
    insets: () => ({ left: 0, top: 0 }),
    log: log.scoped("stage"),
    profiles,
    registrar,
    settings,
    tabDragUrl: (tab) => `overlay.html?kind=tabDrag&tabId=${tab.id}`,
    views: new FakeViewFactory(),
  });
  stages.start();
  stages.open(window, () => profiles.currentGroup()?.id);
  const feed = new FakeUpdater();
  new Updater({
    lifecycle: new FakeLifecycle(platform),
    clock: new FakeClock(),
    commands: dispatcher,
    events,
    log: log.scoped("updater"),
    registrar,
    settings,
    updater: feed,
  }).attach();
  const built: (readonly MenuSection<CommandId>[])[] = [];
  new ApplicationMenu({
    apply: (sections) => {
      built.push(sections);
    },
    commands,
    dispatcher,
    events,
    platform,
    log: log.scoped("menu"),
    settings,
  }).start();
  const sections = () => built.at(-1) ?? [];
  const submenu = (label: string) =>
    sections().flatMap((section) =>
      section.kind === "submenu" && section.label === label
        ? entriesOf(section)
        : []
    );
  const actions = () =>
    submenu("View").filter((entry) => entry.id.startsWith("stage."));
  const action = (id: string) => {
    const found = [...actions(), ...submenu("Profiles")].find(
      (candidate) => candidate.id === id
    );
    if (found === undefined) {
      throw new Error(`No menu action ${id}`);
    }
    return found;
  };
  return {
    action,
    actions,
    built,
    events,
    feed,
    log,
    profiles,
    registrar,
    sections,
    settings,
    stages,
    submenu,
    window,
  };
};

const nameOf = (entry: MenuEntry<CommandId>) =>
  entry.kind === "action"
    ? entry.id
    : `${entry.kind}${"role" in entry ? `:${entry.role}` : ""}`;

const shortcuts = (actions: readonly MenuAction<CommandId>[]) =>
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
      {
        accelerator: "CommandOrControl+R",
        id: "stage.reload",
        label: "Reload",
      },
      {
        accelerator: "CommandOrControl+Alt+S",
        id: "stage.swap",
        label: "Swap with next pane",
      },
      {
        accelerator: "CommandOrControl+Alt+=",
        id: "stage.equalise",
        label: "Equalise panes",
      },
      {
        accelerator: "CommandOrControl+Alt+M",
        id: "stage.maximise",
        label: "Maximise pane",
      },
    ]);
    expect(sections()[2]).toStrictEqual({ kind: "role", role: "editMenu" });
  });

  it("puts the sidebar's toggle in the View menu on CmdOrCtrl+S", async () => {
    const { submenu } = await setup();
    expect(
      submenu("View").find((entry) => entry.id === "sidebar.toggle")
        ?.accelerator
    ).toBe("CommandOrControl+S");
  });

  it.each([
    ["darwin", "Command+[", "Command+]"],
    ["linux", "Alt+Left", "Alt+Right"],
    ["win32", "Alt+Left", "Alt+Right"],
  ])(
    "puts back and forward in a History menu after View, on %s's keys",
    async (platform, back, forward) => {
      const { sections, submenu } = await setup(platform);
      const labels = sections().flatMap((section) =>
        section.kind === "submenu" ? [section.label] : []
      );
      expect([
        labels.indexOf("History") - labels.indexOf("View"),
        shortcuts(submenu("History")),
      ]).toStrictEqual([
        1,
        [
          ["stage.back", back],
          ["stage.forward", forward],
        ],
      ]);
    }
  );

  it("puts New tab in a File menu, ending with Close on macOS", async () => {
    const { sections } = await setup("darwin");
    const [, file] = sections();
    expect(file).toMatchObject({
      entries: [
        { id: "launcher.open", kind: "action" },
        { kind: "separator" },
        { kind: "role", role: "close" },
      ],
      kind: "submenu",
      label: "File",
    });
  });

  it.each(["linux", "win32"])(
    "opens with the app-named menu on %s too, holding the update commands, Settings and Quit, and ends the File menu with Close and Minimize",
    async (platform) => {
      const { sections } = await setup(platform);
      const [app, file] = sections();
      expect([
        app?.kind === "app" && app.entries.map(nameOf),
        file?.kind === "submenu" && file.entries.map(nameOf),
        sections().some(
          (section) => section.kind === "submenu" && section.label === "Help"
        ),
      ]).toStrictEqual([
        [
          "role:about",
          "separator",
          "updater.check",
          "updater.install",
          "settings.open",
          "separator",
          "role:quit",
        ],
        ["launcher.open", "separator", "role:close", "role:minimize"],
        false,
      ]);
    }
  );

  it("puts the update commands and Settings in the app menu on macOS, between About and Services", async () => {
    const { sections } = await setup("darwin");
    const [app] = sections();
    expect(app?.kind === "app" && app.entries.map(nameOf)).toStrictEqual([
      "role:about",
      "separator",
      "updater.check",
      "updater.install",
      "settings.open",
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

  it("lists the profile commands in a Profiles menu, enabled for the profiles there are", async () => {
    const { submenu } = await setup();
    expect(
      submenu("Profiles").map(({ id, accelerator, enabled }) => [
        id,
        accelerator,
        enabled,
      ])
    ).toStrictEqual([
      ["profiles.select1", "CommandOrControl+1", true],
      ["profiles.select2", "CommandOrControl+2", false],
      ["profiles.select3", "CommandOrControl+3", false],
      ["profiles.select4", "CommandOrControl+4", false],
      ["profiles.select5", "CommandOrControl+5", false],
      ["profiles.select6", "CommandOrControl+6", false],
      ["profiles.select7", "CommandOrControl+7", false],
      ["profiles.select8", "CommandOrControl+8", false],
      ["profiles.select9", "CommandOrControl+9", false],
      ["profiles.next", "CommandOrControl+Shift+]", false],
      ["profiles.previous", "CommandOrControl+Shift+[", false],
    ]);
  });

  it("runs a command in the window it is for", async () => {
    const { action, events, stages, window, profiles } = await setup();
    const requested: number[] = [];
    events.on("split.requested", ({ windowId }) => {
      requested.push(windowId);
    });
    action("stage.splitVertical").run(window.contentsId);
    stages
      .find(window.contentsId)
      ?.openTab(profiles.selected().id, "calendar", "vertical");
    action("stage.closeTab").run(window.contentsId);
    expect([requested, window.childViews().length]).toStrictEqual([
      [window.contentsId],
      1,
    ]);
  });

  it("logs what it could not do and does nothing without a window", async () => {
    const { action, window, log } = await setup();
    action("stage.closeTab").run(window.contentsId);
    action("stage.closeTab").run(undefined);
    expect(log.entries).toStrictEqual([
      {
        fields: { id: "stage.closeTab", reason: "lastPane" },
        level: "warn",
        message: "A command refused to run",
        scope: "menu",
      },
    ]);
  });

  it("rebuilds with the user's shortcuts when they change, and only then", async () => {
    const { actions, built, settings, log } = await setup();
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
      ["stage.reload", "CommandOrControl+R"],
      ["stage.swap", "CommandOrControl+Alt+S"],
      ["stage.equalise", "CommandOrControl+Alt+="],
      ["stage.maximise", "CommandOrControl+Alt+M"],
    ]);
    settings.set("shortcuts.bindings", {
      "stage.splitHorizontal": "Cmd+V",
      "stage.splitVertical": "CmdOrCtrl+V",
    });
    expect(log.entries).toStrictEqual([
      {
        fields: {
          accelerator: "Command+V",
          ids: ["stage.splitHorizontal", "stage.splitVertical"],
        },
        level: "warn",
        message: "Commands share a shortcut",
        scope: "menu",
      },
    ]);
  });

  it("runs a command a page asks for, in the page's window", async () => {
    const { events, registrar, window } = await setup();
    const requested: number[] = [];
    events.on("split.requested", ({ windowId }) => {
      requested.push(windowId);
    });
    expect(
      registrar.dispatch(window.contentsId, wireName(channels.run), {
        id: "stage.splitVertical",
      })
    ).toStrictEqual({ ok: true, value: null });
    expect(requested).toStrictEqual([window.contentsId]);
    expect(
      registrar.dispatch(-1, wireName(channels.run), { id: "stage.closeTab" })
    ).toStrictEqual({
      error: { kind: "failed", message: "unknownWindow" },
      ok: false,
    });
  });
});
