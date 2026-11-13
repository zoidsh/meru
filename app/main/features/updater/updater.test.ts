import { describe, expect, it } from "vitest";

import { AppEvents } from "../../../core/events.ts";
import { updateStateSchema } from "../../../core/records/update.ts";
import { updater as channels } from "../../../shared/channels/updater.ts";
import { FakeApp } from "../../../test/fakes/app.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeCommandRegistrar } from "../../../test/fakes/commands.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { FakeRegistrar } from "../../../test/fakes/registrar.ts";
import { FakeUpdater } from "../../../test/fakes/updater.ts";
import { SettingsStore } from "../settings/index.ts";
import { FIRST_CHECK_DELAY, Updater } from "./index.ts";

const HOUR = 3_600_000;
const PAGE = 7;

const setup = ({ packaged = true } = {}) => {
  const clock = new FakeClock();
  const registrar = new FakeRegistrar();
  const settings = new SettingsStore({
    app: new FakeApp(),
    clock,
    fs: new FakeFs(),
    onError: (error) => {
      throw error;
    },
    onFallback: () => {
      throw new Error("Nothing was read, so nothing can fall back");
    },
    registrar,
    watchFile: false,
  });
  const feed = new FakeUpdater();
  const commands = new FakeCommandRegistrar();
  const events = new AppEvents();
  let invalidated = 0;
  events.on("menu.invalidated", () => {
    invalidated += 1;
  });
  const updater = new Updater({
    app: new FakeApp("darwin", packaged),
    clock,
    commands,
    events,
    onError: (error) => {
      throw error;
    },
    registrar,
    settings,
    updater: feed,
  });
  updater.attach();
  const pushed = () =>
    registrar.pushes
      .filter((push) => push.channel === "updater.changed")
      .map((push) => updateStateSchema.parse(push.payload));
  return {
    clock,
    commands,
    feed,
    invalidated: () => invalidated,
    pushed,
    registrar,
    settings,
    updater,
  };
};

describe(Updater, () => {
  it("checks once the delay after the window has passed, and not before", () => {
    const { clock, feed, updater } = setup();
    updater.start();
    clock.advance(FIRST_CHECK_DELAY - 1);
    expect(feed.checks).toHaveLength(0);
    clock.advance(1);
    expect(feed.checks).toStrictEqual([false]);
  });

  it("checks again at the interval the user set, and at a new one from when it changes", () => {
    const { clock, feed, settings, updater } = setup();
    updater.start();
    clock.advance(FIRST_CHECK_DELAY + 4 * HOUR);
    expect(feed.checks).toHaveLength(2);
    settings.set("updater.intervalHours", 1);
    clock.advance(HOUR);
    expect(feed.checks).toHaveLength(3);
    clock.advance(HOUR);
    expect(feed.checks).toHaveLength(4);
  });

  it("asks for prereleases on beta, and checks at once when the channel changes", () => {
    const { feed, settings, updater } = setup();
    updater.start();
    settings.set("updater.channel", "beta");
    expect(feed.checks).toStrictEqual([true]);
  });

  it("never checks when not packaged, and says so when asked", () => {
    const { clock, commands, feed, settings, updater } = setup({
      packaged: false,
    });
    updater.start();
    clock.advance(FIRST_CHECK_DELAY + 24 * HOUR);
    settings.set("updater.channel", "beta");
    expect(feed.checks).toHaveLength(0);
    expect(commands.run("updater.check", 1)).toStrictEqual({
      error: "notPackaged",
      ok: false,
    });
  });

  it("walks a found update through download to ready, pushing each state to a page that asked", () => {
    const { feed, pushed, registrar } = setup();
    expect(registrar.call(channels.snapshot, {}, PAGE)).toStrictEqual({
      ok: true,
      value: { kind: "idle" },
    });
    feed.emit({ kind: "checking" });
    feed.emit({ kind: "available", version: "4.1.0" });
    feed.emit({ kind: "progress", percent: 42.5 });
    feed.emit({ kind: "downloaded", version: "4.1.0" });
    expect(pushed()).toStrictEqual([
      { kind: "checking" },
      { kind: "available", version: "4.1.0" },
      { kind: "downloading", percent: 42.5 },
      { kind: "ready", version: "4.1.0" },
    ]);
  });

  it("goes back to idle when there is nothing new, and to error when the feed fails", async () => {
    const { feed, updater } = setup();
    feed.emit({ kind: "checking" });
    feed.emit({ kind: "notAvailable" });
    expect(updater.current()).toStrictEqual({ kind: "idle" });
    feed.failNext = new Error("net::ERR_INTERNET_DISCONNECTED");
    updater.check();
    await expect
      .poll(() => updater.current())
      .toStrictEqual({
        kind: "error",
        message: "net::ERR_INTERNET_DISCONNECTED",
      });
  });

  it("enables Restart to update only once an update is ready, and then installs it", () => {
    const { commands, feed, invalidated } = setup();
    expect(commands.enabled("updater.install")).toBeFalsy();
    feed.emit({ kind: "downloaded", version: "4.1.0" });
    expect(commands.enabled("updater.install")).toBeTruthy();
    expect(invalidated()).toBe(1);
    expect(commands.run("updater.install", 1).ok).toBeTruthy();
    expect(feed.installs).toBe(1);
  });

  it("keeps a ready update through a later error and checks no more", () => {
    const { clock, feed, updater } = setup();
    updater.start();
    feed.emit({ kind: "downloaded", version: "4.1.0" });
    feed.emit({ kind: "error", message: "offline" });
    clock.advance(FIRST_CHECK_DELAY + 8 * HOUR);
    expect(updater.current()).toStrictEqual({
      kind: "ready",
      version: "4.1.0",
    });
    expect(feed.checks).toHaveLength(0);
  });
});
