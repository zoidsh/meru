import { describe, expect, it } from "vitest";

import { wireName } from "../../../shared/channels/define.ts";
import { launcher } from "../../../shared/channels/launcher.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { testApp, testStages } from "../../testing.ts";
import { Launcher } from "./index.ts";

const setup = async () => {
  const app = await testApp();
  const { commands, events, registrar, transport } = app;
  const { stage, stages, views, window } = testStages(app, {
    onSplitRequested: (windowId, orientation) => {
      launcherOf.open(windowId, orientation);
    },
  });
  const launcherOf = new Launcher({
    commands,
    overlayUrl: (kind, query) =>
      `overlay.html?${new URLSearchParams({ ...query, kind }).toString()}`,
    registrar,
    stages,
  });
  launcherOf.start();
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
