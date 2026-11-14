import { describe, expect, it } from "vitest";

import type { Sidebar } from "../../../core/engines/sidebar.ts";
import { sidebarSchema } from "../../../core/engines/sidebar.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { sidebar, sidebarPushes } from "../../../shared/channels/sidebar.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { testApp } from "../../testing.ts";
import { Sidebars } from "./index.ts";

const PAGE = 3;

const setup = async () => {
  const { commands, events, profiles, registrar, settings, transport } =
    await testApp();
  registrar.assign(PAGE, chromeSurface);
  const changes: Sidebar[] = [];
  events.on("sidebar.changed", () => {
    changes.push(sidebars.current());
  });
  const sidebars = new Sidebars({
    commands,
    events,
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
    profiles.openTab(profileId, appId);
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

  it("offers sidebar.toggle only while the profile has a sidebar to hide, and sidebar.toggleWidth only while it shows", async () => {
    const { add, commands } = await setup();
    const enabled = () => [
      commands.enabled("sidebar.toggle"),
      commands.enabled("sidebar.toggleWidth"),
    ];
    const alone = enabled();
    add("drive");
    const shown = enabled();
    commands.run("sidebar.toggle", { windowId: PAGE });
    expect([alone, shown, enabled()]).toStrictEqual([
      [false, false],
      [true, true],
      [true, false],
    ]);
  });
});
