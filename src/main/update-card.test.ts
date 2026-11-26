import { describe, expect, it } from "vitest";

import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { fakeUpdater } from "#platform/updater.fake.ts";

import { createFocus } from "./focus.ts";
import { createOverlays } from "./overlay.ts";
import { createSettingsStore } from "./settings.ts";
import { createUpdateCard } from "./update-card.ts";
import { createUpdates } from "./updates.ts";
import { wireUpdateCard } from "./wiring/update-card.ts";

const one: State = {
  version: 1,
  profiles: [newProfile("a", "Default")],
  selectedProfileId: "a",
};

/**
 * The card over the real updates, overlays and focus, a fake updater and
 * a fake overlay view that records focus moving into it.
 */
const setup = ({ canUpdate = true } = {}) => {
  const fake = fakeUpdater({ canUpdate });
  const focused: string[] = [];
  const opened: string[] = [];
  const steps: string[] = [];
  const logs: string[] = [];

  const focus = createFocus({
    ownWindow: () => ({ isFocused: () => false, isVisible: () => false }),
    window: { isFocused: () => true, isVisible: () => true, on: () => false },
    focusWhileInactive: false,
    overlayCoversPages: () => false,
    resolve: (target) => () => {
      focused.push(target.kind);
      focus.noteFocused(target);
    },
  });
  const overlays = createOverlays({
    focus,
    initial: one,
    bounds: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    log: () => false,
  });

  overlays.adopt({
    webContentsId: 3,
    setBounds: () => false,
    show: () => false,
    hide: () => false,
    focus: () => {
      focused.push("overlay");
      focus.noteFocused({ kind: "overlay" });
    },
    onFocus: () => false,
    onKey: () => false,
    moveUnder: () => false,
    moveOver: () => false,
    onGone: () => false,
    close: () => false,
  });

  const updates = createUpdates({
    updater: fake.updater,
    settings: createSettingsStore({
      initial: { version: 1 },
      save: () => Promise.resolve(),
      platform: "darwin",
      log: () => false,
    }),
    runningVersion: "4.1.0",
    quitThen: () => {
      steps.push("quitThen");
    },
    quit: () => false,
    openExternal: (url) => {
      opened.push(url);
    },
    home: "",
    now: () => 0,
    log: () => false,
  });
  const card = wireUpdateCard({
    updates,
    overlays,
    log: (message) => {
      logs.push(message);
    },
  });
  focus.noteFocused({ kind: "front" });
  focused.length = 0;

  return {
    ...fake,
    focus,
    overlays,
    card,
    focused,
    opened,
    steps,
    logs,
    ready: async (version: string) => {
      await fake.emit({ kind: "available", version });
      await fake.emit({ kind: "downloaded", version });
    },
  };
};

describe(createUpdateCard, () => {
  it("shows a ready version without taking focus", async () => {
    const app = setup();

    await app.ready("4.2.0");

    expect([app.overlays.current(), app.focused]).toStrictEqual([
      { kind: "update", card: "ready", version: "4.2.0" },
      [],
    ]);
  });

  it("gives way to a card or a toast and comes back once the view is free", async () => {
    const app = setup();

    await app.ready("4.2.0");
    app.overlays.open({ kind: "downloads" });

    expect(app.overlays.current()).toStrictEqual({ kind: "downloads" });

    app.overlays.close();

    expect(app.overlays.current()).toStrictEqual({
      kind: "update",
      card: "ready",
      version: "4.2.0",
    });

    app.overlays.open({ kind: "toast", message: "no-room" });
    app.overlays.close();

    expect(app.overlays.current()?.kind).toBe("update");
  });

  it("stays away after Later until a newer version is ready", async () => {
    const app = setup();

    await app.ready("4.2.0");
    app.card.run("dismiss");
    app.overlays.open({ kind: "downloads" });
    app.overlays.close();
    await app.emit({ kind: "available", version: "4.2.0" });

    expect(app.overlays.current()).toBeUndefined();

    await app.ready("4.2.1");

    expect(app.overlays.current()).toStrictEqual({
      kind: "update",
      card: "ready",
      version: "4.2.1",
    });
  });

  it("is replaced by the unverified card, which Close puts away", async () => {
    const app = setup();

    await app.ready("4.2.0");
    await app.emit({ kind: "available", version: "4.2.1" });
    await app.emit({ kind: "error", signature: true });

    expect(app.overlays.current()).toStrictEqual({
      kind: "update",
      card: "unverified",
      version: "4.2.1",
    });

    app.card.run("download");
    app.card.run("dismiss");

    expect([app.overlays.current(), app.opened]).toStrictEqual([
      undefined,
      ["https://github.com/zoidsh/meru/releases/tag/v4.2.1"],
    ]);
  });

  it("opens the ready version's release page for What's new and installs for Restart now", async () => {
    const app = setup();

    await app.ready("4.2.0");
    app.card.run("whats-new");
    app.card.run("restart");

    expect([app.opened, app.steps]).toStrictEqual([
      ["https://github.com/zoidsh/meru/releases/tag/v4.2.0"],
      ["quitThen"],
    ]);
  });

  it("refuses what the open card does not offer, or any button with no card open", async () => {
    const app = setup();

    app.card.run("restart");
    await app.ready("4.2.0");
    app.card.run("download");

    expect([app.steps, app.opened, app.logs]).toStrictEqual([
      [],
      [],
      [
        "Refused the update card's restart with no card open",
        "Refused the update card's download on a ready card",
      ],
    ]);
  });

  it("gives focus back to the page only when it had moved into the card", async () => {
    const app = setup();

    await app.ready("4.2.0");
    app.card.run("dismiss");

    expect(app.focused).toStrictEqual([]);

    await app.ready("4.2.1");
    app.focus.noteFocused({ kind: "overlay" });
    app.card.run("dismiss");

    expect(app.focused).toStrictEqual(["front"]);
  });

  it("never shows on a build that cannot update itself", async () => {
    const app = setup({ canUpdate: false });

    await app.ready("4.2.0");

    expect(app.overlays.current()).toBeUndefined();
  });
});
