import { describe, expect, it } from "vitest";

import { AppEvents } from "../../../core/events.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { launcher } from "../../../shared/channels/launcher.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { commands as allCommands } from "../../../shared/commands/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeViewFactory } from "../../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { ShortcutKeys } from "../../shell/keys.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Stages } from "../stage/index.ts";
import { Launcher } from "./index.ts";

const rethrow = (error: unknown) => {
  throw error;
};

const setup = async () => {
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ onError: rethrow, transport });
  const lifecycle = new FakeLifecycle();
  const clock = new FakeClock();
  const settings = new SettingsStore({
    entitlement: () => ({ expiresAt: null, kind: "unknown", source: "stored" }),
    events: new AppEvents(),
    clock,
    fs: new FakeFs(),
    lifecycle,
    onError: rethrow,
    onFallback: rethrow,
    registrar,
    watchFile: false,
  });
  const events = new AppEvents();
  const commands = new CommandDispatcher();
  const profiles = new Profiles({
    clock,
    commands,
    entitlement: { expiresAt: null, kind: "unknown", source: "stored" },
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    lifecycle,
    onError: rethrow,
    registrar,
    report: rethrow,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  const views = new FakeViewFactory();
  const stages = new Stages({
    onOpen: () => false,
    onPopup: () => true,
    keys: new ShortcutKeys({
      commands: allCommands,
      dispatcher: commands,
      platform: "darwin",
      report: rethrow,
      settings,
    }),
    blankPanes: true,
    commands,
    dragPreload: undefined,
    events,
    insets: () => ({ left: 0, top: 0 }),
    onError: rethrow,
    overlayPreload: "renderer.cjs",
    profiles,
    registrar,
    settings,
    tabDragUrl: (tab) =>
      `overlay.html?${new URLSearchParams({ appId: tab.appId, kind: "tabDrag", tabId: tab.id }).toString()}`,
    views,
  });
  stages.start();
  const window = new FakeWindow(1200, 800);
  registrar.assign(window.contentsId, chromeSurface);
  const stage = stages.open(window, () => profiles.currentGroup()?.id);
  new Launcher({
    commands,
    events,
    overlayUrl: (kind, query) =>
      `overlay.html?${new URLSearchParams({ ...query, kind }).toString()}`,
    registrar,
    stages,
  }).start();
  return { commands, events, registrar, stage, transport, views, window };
};

describe(Launcher, () => {
  it("opens the launcher's page over the window's panes on launcher.open, and closes it from that page", async () => {
    const { commands, registrar, views, window } = await setup();
    expect(
      commands.run("launcher.open", { windowId: window.contentsId }).ok
    ).toBeTruthy();
    const overlay = views.created.at(-1);
    await expect.poll(() => overlay?.url).toBe("overlay.html?kind=launcher");
    expect(overlay?.bounds()).toStrictEqual(window.contentBounds());
    expect(
      registrar.dispatch(overlay?.contentsId ?? 0, wireName(launcher.close), {})
        .ok
    ).toBeTruthy();
    expect([
      overlay?.destroyed,
      window.childViews().some((view) => view === overlay),
    ]).toStrictEqual([true, false]);
  });

  it("opens the launcher's page over the sender's panes from the chrome page's button", async () => {
    const { registrar, views, window } = await setup();
    expect(
      registrar.dispatch(window.contentsId, wireName(launcher.open), {}).ok
    ).toBeTruthy();
    await expect
      .poll(() => views.created.at(-1)?.url)
      .toBe("overlay.html?kind=launcher");
  });

  it("opens the launcher's page for a split of the orientation launcher.open names", async () => {
    const { registrar, views, window } = await setup();
    registrar.dispatch(window.contentsId, wireName(launcher.open), {
      split: "horizontal",
    });
    await expect
      .poll(() => views.created.at(-1)?.url)
      .toBe("overlay.html?split=horizontal&kind=launcher");
  });

  it("opens the launcher's page for a split when a split command asks, in its window", async () => {
    const { commands, views, window } = await setup();
    expect(
      commands.run("stage.splitVertical", { windowId: window.contentsId }).ok
    ).toBeTruthy();
    const overlay = views.created.at(-1);
    await expect
      .poll(() => overlay?.url)
      .toBe("overlay.html?split=vertical&kind=launcher");
    expect(window.childViews().at(-1)).toBe(overlay);
  });

  it("refuses to open from a sender with no window", async () => {
    const { registrar } = await setup();
    registrar.assign(99, chromeSurface);
    expect(registrar.dispatch(99, wireName(launcher.open), {})).toMatchObject({
      ok: false,
    });
  });
});
