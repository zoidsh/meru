import { describe, expect, it } from "vitest";

import { updateStateSchema } from "../../../core/records/update.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { settingsSurface } from "../../../shared/channels/surfaces.ts";
import { updater as channels } from "../../../shared/channels/updater.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeLog } from "../../../test/fakes/log.ts";
import { FakeUpdater } from "../../../test/fakes/updater.ts";
import { testApp } from "../../testing.ts";
import { FIRST_CHECK_DELAY, Updater } from "./index.ts";

const HOUR = 3_600_000;
const PAGE = 7;

const setup = async ({ packaged = true } = {}) => {
  const lifecycle = new FakeLifecycle("darwin", packaged);
  const { clock, commands, events, registrar, settings, transport } =
    await testApp({ lifecycle });
  registrar.assign(PAGE, settingsSurface);
  const feed = new FakeUpdater();
  let invalidated = 0;
  events.on("menu.invalidated", () => {
    invalidated += 1;
  });
  const log = new FakeLog();
  const updater = new Updater({
    lifecycle,
    clock,
    commands,
    events,
    log: log.scoped("updater"),
    registrar,
    settings,
    updater: feed,
  });
  updater.attach();
  const pushed = () =>
    transport.sent
      .filter((push) => push.channel === "updater.changed")
      .map((push) => updateStateSchema.parse(push.payload));
  return {
    clock,
    commands,
    feed,
    invalidated: () => invalidated,
    log,
    pushed,
    registrar,
    settings,
    updater,
  };
};

describe(Updater, () => {
  it("checks once the delay after the window has passed, and not before", async () => {
    const { clock, feed, updater } = await setup();
    updater.start();
    clock.advance(FIRST_CHECK_DELAY - 1);
    expect(feed.checks).toHaveLength(0);
    clock.advance(1);
    expect(feed.checks).toStrictEqual([false]);
  });

  it("checks again at the interval the user set, and at a new one from when it changes", async () => {
    const { clock, feed, settings, updater } = await setup();
    updater.start();
    clock.advance(FIRST_CHECK_DELAY + 4 * HOUR);
    expect(feed.checks).toHaveLength(2);
    settings.set("updater.intervalHours", 1);
    clock.advance(HOUR);
    expect(feed.checks).toHaveLength(3);
    clock.advance(HOUR);
    expect(feed.checks).toHaveLength(4);
  });

  it("asks for prereleases on beta, and checks at once when the channel changes", async () => {
    const { feed, settings, updater } = await setup();
    updater.start();
    settings.set("updater.channel", "beta");
    expect(feed.checks).toStrictEqual([true]);
  });

  it("never checks when not packaged, and says so when asked", async () => {
    const { clock, commands, feed, registrar, settings, updater } = await setup(
      {
        packaged: false,
      }
    );
    updater.start();
    clock.advance(FIRST_CHECK_DELAY + 24 * HOUR);
    settings.set("updater.channel", "beta");
    expect(feed.checks).toHaveLength(0);
    expect({
      command: commands.run("updater.check", { windowId: 1 }),
      page: registrar.dispatch(PAGE, wireName(channels.check), {}),
    }).toStrictEqual({
      command: { error: "notPackaged", ok: false },
      page: { ok: true, value: "notPackaged" },
    });
  });

  it("walks a found update through download to ready, pushing each state to a page that asked", async () => {
    const { feed, pushed, registrar } = await setup();
    expect(
      registrar.dispatch(PAGE, wireName(channels.snapshot), {})
    ).toStrictEqual({
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
    const { feed, log, updater } = await setup();
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
    expect(log.at("warn")).toStrictEqual(["Could not check for updates"]);
  });

  it("enables Restart to update only once an update is ready, and then installs it", async () => {
    const { commands, feed, invalidated } = await setup();
    expect(commands.enabled("updater.install")).toBeFalsy();
    feed.emit({ kind: "downloaded", version: "4.1.0" });
    expect(commands.enabled("updater.install")).toBeTruthy();
    expect(invalidated()).toBe(1);
    expect(commands.run("updater.install", { windowId: 1 }).ok).toBeTruthy();
    expect(feed.installs).toBe(1);
  });

  it("keeps a ready update through a later error and checks no more", async () => {
    const { clock, feed, updater } = await setup();
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
