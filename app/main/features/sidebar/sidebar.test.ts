import { describe, expect, it } from "vitest";

import type { Sidebar } from "../../../core/engines/sidebar.ts";
import { sidebarSchema } from "../../../core/engines/sidebar.ts";
import { AppEvents } from "../../../core/events.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { sidebar, sidebarPushes } from "../../../shared/channels/sidebar.ts";
import { rendererSurface } from "../../../shared/channels/surfaces.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Sidebars } from "./index.ts";

const PAGE = 3;

const rethrow = (error: unknown) => {
  throw error;
};

const setup = async () => {
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ onError: rethrow, transport });
  registrar.assign(PAGE, rendererSurface);
  const lifecycle = new FakeLifecycle();
  const clock = new FakeClock();
  const settings = new SettingsStore({
    lifecycle,
    clock,
    fs: new FakeFs(),
    onError: rethrow,
    onFallback: rethrow,
    registrar,
    watchFile: false,
  });
  const events = new AppEvents();
  const commands = new CommandDispatcher();
  const profiles = new Profiles({
    commands,
    lifecycle,
    clock,
    entitlement: { expiresAt: null, kind: "unknown", source: "stored" },
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    onError: rethrow,
    registrar,
    report: rethrow,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  profiles.start();
  const changes: Sidebar[] = [];
  const sidebars = new Sidebars({
    commands,
    events,
    onChange: (changed) => {
      changes.push(changed);
    },
    profiles,
    registrar,
    settings,
  });
  sidebars.start();
  const pushed = () =>
    transport.sent
      .filter((sent) => sent.channel === wireName(sidebarPushes.changed))
      .map((sent) => sidebarSchema.parse(sent.payload));
  const profileId = profiles.selected().id;
  const add = (appId: string) => {
    profiles.addTab(profileId, appId);
  };
  return {
    add,
    changes,
    commands,
    events,
    profileId,
    pushed,
    registrar,
    settings,
    sidebars,
  };
};

const narrow: Sidebar = { kind: "shown", size: "narrow", width: 64 };
const wide: Sidebar = { kind: "shown", size: "wide", width: 224 };

describe(Sidebars, () => {
  it("shows no sidebar for a profile with Gmail alone, and answers the page's snapshot", async () => {
    const { sidebars, registrar } = await setup();
    expect(sidebars.current()).toStrictEqual({ kind: "hidden" });
    expect(
      registrar.dispatch(PAGE, wireName(sidebar.snapshot), {})
    ).toStrictEqual({ ok: true, value: { kind: "hidden" } });
  });

  it("shows the sidebar once the profile has a second tab, wide once an app has two, telling the page and the stage", async () => {
    const { add, changes, pushed } = await setup();
    add("calendar");
    add("drive");
    add("drive");
    expect(changes).toStrictEqual([narrow, wide]);
    expect(pushed()).toStrictEqual(changes);
  });

  it("follows the profile's width setting", async () => {
    const { add, settings, sidebars, profileId } = await setup();
    add("drive");
    settings.set("sidebar.width", "wide", profileId);
    expect(sidebars.current()).toStrictEqual(wide);
  });

  it("hides the sidebar and brings it back on sidebar.toggle, and flips its width on sidebar.toggleWidth", async () => {
    const { add, commands, sidebars, settings } = await setup();
    add("drive");
    const run = (id: CommandId) => {
      commands.run(id, { windowId: PAGE });
      return sidebars.current();
    };
    expect([
      run("sidebar.toggle"),
      commands.enabled("sidebar.toggleWidth"),
      run("sidebar.toggle"),
      run("sidebar.toggleWidth"),
    ]).toStrictEqual([{ kind: "hidden" }, false, narrow, wide]);
    settings.set("sidebar.width", "narrow");
    expect(sidebars.current()).toStrictEqual(wide);
  });

  it("offers sidebar.toggle only while the profile has a sidebar to hide, and has the menu rebuilt when the sidebar changes", async () => {
    const { add, commands, events } = await setup();
    const alone = commands.enabled("sidebar.toggle");
    add("drive");
    let invalidated = 0;
    events.on("menu.invalidated", () => {
      invalidated += 1;
    });
    commands.run("sidebar.toggle", { windowId: PAGE });
    expect([
      alone,
      commands.enabled("sidebar.toggle"),
      invalidated,
    ]).toStrictEqual([false, true, 1]);
  });
});
