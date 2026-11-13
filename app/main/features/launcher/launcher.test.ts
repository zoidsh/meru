import { describe, expect, it } from "vitest";

import { AppEvents } from "../../../core/events.ts";
import type { Rect } from "../../../core/records/rect.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { launcher, launcherPushes } from "../../../shared/channels/launcher.ts";
import { rendererSurface } from "../../../shared/channels/surfaces.ts";
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
    blankPanes: true,
    commands,
    dragPreload: undefined,
    events,
    insets: () => ({ left: 0, top: 0 }),
    onError: rethrow,
    popupPreload: "renderer.cjs",
    profiles,
    registrar,
    settings,
    views,
  });
  stages.start();
  const window = new FakeWindow(1200, 800);
  registrar.assign(window.contentsId, rendererSurface);
  const stage = stages.open(window, () => profiles.currentGroup()?.id);
  new Launcher({
    commands,
    pageUrl: (anchor: Rect) => `launcher.html#${anchor.x},${anchor.y}`,
    registrar,
    stages,
  }).start();
  return { commands, registrar, stage, transport, window };
};

describe(Launcher, () => {
  it("asks the window's chrome page to open the launcher from its button on launcher.open", async () => {
    const { commands, transport, window } = await setup();
    transport.sent.length = 0;
    commands.run("launcher.open", { windowId: window.contentsId });
    expect(
      transport.sent.map((sent) => [sent.contentsId, sent.channel])
    ).toStrictEqual([[window.contentsId, wireName(launcherPushes.requested)]]);
  });

  it("opens the launcher's page over the sender's panes beside the anchor, and closes it from that page", async () => {
    const { registrar, stage, window } = await setup();
    const anchor = { height: 28, width: 28, x: 900, y: 6 };
    expect(
      registrar.dispatch(window.contentsId, wireName(launcher.open), {
        anchor,
      }).ok
    ).toBeTruthy();
    const { popup } = stage;
    expect(
      registrar.dispatch(popup?.contentsId ?? 0, wireName(launcher.close), {})
        .ok
    ).toBeTruthy();
    expect([popup?.bounds(), stage.popup]).toStrictEqual([
      window.contentBounds(),
      undefined,
    ]);
  });

  it("refuses to open from a sender with no window", async () => {
    const { registrar } = await setup();
    registrar.assign(99, rendererSurface);
    expect(
      registrar.dispatch(99, wireName(launcher.open), {
        anchor: { height: 1, width: 1, x: 0, y: 0 },
      })
    ).toMatchObject({ ok: false });
  });
});
