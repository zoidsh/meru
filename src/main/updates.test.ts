import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UPDATE_CHECK_INTERVAL } from "#core/updates.ts";
import { fakeUpdater } from "#platform/updater.fake.ts";

import { createSettingsStore } from "./settings.ts";
import { createUpdates, loggableUpdateError } from "./updates.ts";

const HOUR = 60 * 60 * 1000;

const setup = ({
  stored = {},
  canUpdate = true,
  noUpdater = false,
  runningVersion = "4.1.0",
}: {
  stored?: Record<string, unknown>;
  canUpdate?: boolean;
  noUpdater?: boolean;
  runningVersion?: string;
} = {}) => {
  const fake = fakeUpdater({ canUpdate });
  const settings = createSettingsStore({
    initial: { version: 1, ...stored },
    save: () => Promise.resolve(),
    platform: "darwin",
    log: () => false,
  });
  const steps: string[] = [];
  const opened: string[] = [];
  const logs: string[] = [];
  let finish: (() => void) | undefined;
  const updates = createUpdates({
    updater: noUpdater ? undefined : fake.updater,
    settings,
    runningVersion,
    quitThen: (next) => {
      steps.push("quitThen");
      finish = next;
    },
    quit: () => {
      steps.push("quit");
    },
    openExternal: (url) => {
      opened.push(url);
    },
    home: "/Users/someone",
    now: () => Date.now(),
    log: (message) => {
      logs.push(message);
    },
  });

  return {
    ...fake,
    settings,
    updates,
    steps,
    opened,
    logs,
    /** Lets the quit's held work settle, so the quit is finished. */
    finishQuit: () => {
      finish?.();
    },
  };
};

/** An app with 4.2.0 downloaded. */
const ready = async () => {
  const app = setup();

  app.updates.start();
  await app.emit({ kind: "available", version: "4.2.0" });
  await app.emit({ kind: "downloaded", version: "4.2.0" });

  return app;
};

describe(createUpdates, () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 10_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("when checks run", () => {
    it("checks once the window shows, not before, then every three hours", async () => {
      const app = setup();

      expect(app.checks()).toBe(0);

      app.updates.start();
      expect(app.checks()).toBe(1);
      await app.emit({ kind: "notAvailable" });

      await vi.advanceTimersByTimeAsync(3 * HOUR - 1);
      expect(app.checks()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(app.checks()).toBe(2);
      await app.emit({ kind: "notAvailable" });
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);
      expect(app.checks()).toBe(3);
    });

    it("never checks on its own with the switch off", async () => {
      const app = setup({ stored: { autoUpdate: false } });

      app.updates.start();
      await vi.advanceTimersByTimeAsync(10 * HOUR);

      expect(app.checks()).toBe(0);
      expect(app.updates.read().status).toBe("idle");
    });

    it("stops the interval when the switch goes off, and checks and starts it again when on", async () => {
      const app = setup();

      app.updates.start();
      await app.emit({ kind: "notAvailable" });
      await app.settings.update("autoUpdate", () => false);
      await vi.advanceTimersByTimeAsync(6 * HOUR);
      expect(app.checks()).toBe(1);

      await app.settings.update("autoUpdate", () => true);
      expect(app.checks()).toBe(2);
      await app.emit({ kind: "notAvailable" });
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      expect(app.checks()).toBe(3);
    });

    it("checks as the channel changes, even with the switch off, applying the channel first", async () => {
      const app = setup({ stored: { autoUpdate: false } });

      app.updates.start();
      await app.settings.update("updateChannel", () => "beta");

      expect(app.checks()).toBe(1);
      expect(app.calls.slice(-2)).toStrictEqual(["setChannel", "check"]);
      expect(app.channels).toStrictEqual([
        { channel: "latest", allowPrerelease: false, allowDowngrade: false },
        { channel: "beta", allowPrerelease: true, allowDowngrade: false },
      ]);
    });

    it("applies the channel for the running version at launch", () => {
      const app = setup({
        stored: { updateChannel: "stable" },
        runningVersion: "4.1.0-beta.3",
      });

      expect(app.channels).toStrictEqual([
        { channel: "latest", allowPrerelease: false, allowDowngrade: true },
      ]);
    });

    it("starts no second check while one runs", async () => {
      const app = setup();

      app.updates.start();
      app.updates.check();
      await app.settings.update("updateChannel", () => "beta");
      expect(app.checks()).toBe(1);

      await app.emit({ kind: "notAvailable" });
      app.updates.check();
      expect(app.checks()).toBe(2);
    });

    it("reads a stored channel it does not know as stable", () => {
      const app = setup({ stored: { updateChannel: "nightly" } });

      expect(app.channels[0]?.channel).toBe("latest");
    });
  });

  describe("status", () => {
    it("follows each event", async () => {
      const app = setup();
      const seen: string[] = [];

      app.updates.onChange(() => {
        const { status, version } = app.updates.read();

        seen.push(version === null ? status : `${status} ${version}`);
      });
      app.updates.start();
      await app.emit({ kind: "checking" });
      await app.emit({ kind: "notAvailable" });
      app.updates.check();
      await app.emit({ kind: "checking" });
      await app.emit({ kind: "error", signature: false }, "net::ERR_FAILED");
      app.updates.check();
      await app.emit({ kind: "checking" });
      await app.emit({ kind: "available", version: "4.2.0" });
      await app.emit({ kind: "error", signature: true }, "not signed");
      app.updates.check();
      await app.emit({ kind: "checking" });
      await app.emit({ kind: "available", version: "4.2.1" });
      await app.emit({ kind: "downloaded", version: "4.2.1" });

      expect(seen).toStrictEqual([
        "checking",
        "upToDate",
        "checking",
        "failed",
        "checking",
        "downloading 4.2.0",
        "unverified 4.2.0",
        "checking",
        "downloading 4.2.1",
        "ready 4.2.1",
      ]);
    });

    it("keeps when the last check finished", async () => {
      const app = setup();

      app.updates.start();
      await vi.advanceTimersByTimeAsync(500);
      await app.emit({ kind: "notAvailable" });

      expect(app.updates.read()).toStrictEqual({
        status: "upToDate",
        version: null,
        lastChecked: 10_500,
      });
    });

    it("stays ready through the interval's checks of the same version", async () => {
      const app = setup();

      app.updates.start();
      await app.emit({ kind: "available", version: "4.2.0" });
      await app.emit({ kind: "downloaded", version: "4.2.0" });
      await vi.advanceTimersByTimeAsync(3 * HOUR);
      await app.emit({ kind: "checking" });
      expect(app.updates.read().status).toBe("ready");
      await app.emit({ kind: "available", version: "4.2.0" });
      await app.emit({ kind: "downloaded", version: "4.2.0" });

      expect(app.updates.read()).toMatchObject({
        status: "ready",
        version: "4.2.0",
      });
    });

    it("logs an error without a URL's query or the home folder", async () => {
      const app = setup();

      app.updates.start();
      await app.emit(
        { kind: "error", signature: false },
        "404 https://github.com/zoidsh/meru/releases/download/v4.2.0/latest-mac.yml?token=secret at /Users/someone/Library/Caches"
      );

      expect(app.logs).toStrictEqual([
        "Update failed: 404 https://github.com/zoidsh/meru/releases/download/v4.2.0/latest-mac.yml at ~/Library/Caches",
      ]);
    });
  });

  describe("Restart now", () => {
    it("goes through the quit and installs once its held work is done", async () => {
      const app = await ready();

      app.updates.restart();
      expect(app.steps).toStrictEqual(["quitThen"]);
      expect(app.calls).not.toContain("quitAndInstall");

      app.finishQuit();
      expect(app.calls.at(-1)).toBe("quitAndInstall");
    });

    it("starts one quit however often it is pressed", async () => {
      const app = await ready();

      app.updates.restart();
      app.updates.restart();

      expect(app.steps).toStrictEqual(["quitThen"]);
    });

    it("finishes the quit when the install finds nothing to install", async () => {
      const app = await ready();

      app.updates.restart();
      app.finishQuit();
      await app.emit({ kind: "error", signature: false }, "No update filepath");

      expect(app.steps).toStrictEqual(["quitThen", "quit"]);
    });

    it("does nothing with nothing downloaded", async () => {
      const app = setup();

      app.updates.start();
      await app.emit({ kind: "available", version: "4.2.0" });
      app.updates.restart();

      expect(app.steps).toStrictEqual([]);
    });
  });

  it("opens the release page of the version that could not be verified, and nothing otherwise", async () => {
    const app = setup();

    app.updates.start();
    app.updates.openRelease();
    await app.emit({ kind: "available", version: "4.2.0" });
    await app.emit({ kind: "error", signature: true });
    app.updates.openRelease();

    expect(app.opened).toStrictEqual([
      "https://github.com/zoidsh/meru/releases/tag/v4.2.0",
    ]);
  });

  describe("a build that cannot update itself", () => {
    it("is unsupported and asks the updater nothing but whether it can", async () => {
      const app = setup({ canUpdate: false });

      app.updates.start();
      app.updates.check();
      await app.settings.update("updateChannel", () => "beta");
      await vi.advanceTimersByTimeAsync(6 * HOUR);

      expect(app.updates.read().status).toBe("unsupported");
      expect(app.calls).toStrictEqual(["canUpdate"]);
    });

    it("is unsupported with no updater at all", () => {
      const app = setup({ noUpdater: true });

      app.updates.start();

      expect(app.updates.read().status).toBe("unsupported");
      expect(app.calls).toStrictEqual([]);
    });
  });
});

describe(loggableUpdateError, () => {
  it("keeps a message with neither as it is", () => {
    expect(loggableUpdateError("net::ERR_INTERNET_DISCONNECTED", "")).toBe(
      "net::ERR_INTERNET_DISCONNECTED"
    );
  });
});
