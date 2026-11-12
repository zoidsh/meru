import { describe, expect, it, vi } from "vitest";

import type {
  Fallback,
  SettingChange,
} from "../../../core/engines/settings.ts";
import { settings as channels } from "../../../shared/channels/settings.ts";
import { FakeApp } from "../../../test/fakes/app.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { FakeRegistrar } from "../../../test/fakes/registrar.ts";
import { SETTINGS_FILE, SettingsStore } from "./index.ts";

const file = (data: unknown) => JSON.stringify({ data, version: 1 });

const setup = async (
  data?: unknown,
  { watchFile = false }: { watchFile?: boolean } = {}
) => {
  const fs = new FakeFs(
    data === undefined ? {} : { [SETTINGS_FILE]: file(data) }
  );
  const clock = new FakeClock();
  const app = new FakeApp();
  const registrar = new FakeRegistrar();
  const fallbacks: Fallback[] = [];
  const store = new SettingsStore({
    app,
    clock,
    fs,
    onError: (error) => {
      throw error;
    },
    onFallback: (found) => {
      fallbacks.push(...found);
    },
    registrar,
    watchFile,
  });
  const opened = await store.open();
  store.start();
  const changes: SettingChange[][] = [];
  store.subscribe((changed) => {
    changes.push([...changed]);
  });
  return { app, changes, clock, fallbacks, fs, opened, registrar, store };
};

const stored = (fs: FakeFs): unknown =>
  JSON.parse(fs.files.get(SETTINGS_FILE) ?? "null");

describe(SettingsStore, () => {
  it("resolves a profile's override, then the global value, then the default", async () => {
    const { store } = await setup({
      global: { "appearance.style": "classic" },
      profiles: { work: { "stage.zoom": 1.5 } },
    });
    expect(store.get("appearance.style")).toBe("classic");
    expect(store.get("stage.zoom", "work")).toBe(1.5);
    expect(store.get("stage.zoom", "home")).toBe(1);
    expect(store.get("shortcuts.bindings")).toStrictEqual({});
  });

  it("starts from defaults when the file is corrupt, and says what fell back", async () => {
    const { store, fallbacks, opened } = await setup({
      global: { "appearance.style": "neon" },
      profiles: { work: { "appearance.style": "classic" } },
    });
    expect(store.get("appearance.style")).toBe("modern");
    expect(opened.source).toBe("file");
    expect(fallbacks).toStrictEqual([
      { key: "appearance.style", profileId: null, reason: "invalid" },
      {
        key: "appearance.style",
        profileId: "work",
        reason: "notProfileScoped",
      },
    ]);
  });

  it("sets a value, tells subscribers what changed and writes the file once", async () => {
    const { store, changes, clock, fs } = await setup();
    expect(store.set("stage.zoom", 2, "work")).toStrictEqual({
      ok: true,
      value: undefined,
    });
    store.set("appearance.style", "classic");
    store.set("appearance.style", "classic");
    expect(changes).toStrictEqual([
      [{ key: "stage.zoom", profileId: "work" }],
      [{ key: "appearance.style", profileId: null }],
    ]);
    clock.advance(1000);
    await store.flush();
    expect(fs.writes).toHaveLength(1);
    expect(stored(fs)).toStrictEqual({
      data: {
        global: { "appearance.style": "classic" },
        profiles: { work: { "stage.zoom": 2 } },
      },
      version: 1,
    });
  });

  it("removes a value so the layer below shows through", async () => {
    const { store } = await setup({
      global: { "stage.zoom": 1.25 },
      profiles: { work: { "stage.zoom": 2 } },
    });
    store.set("stage.zoom", undefined, "work");
    expect(store.get("stage.zoom", "work")).toBe(1.25);
  });

  it("refuses a value its schema refuses, and a profile override of a global key", async () => {
    const { store, changes } = await setup();
    // @ts-expect-error: not a style
    expect(store.set("appearance.style", "neon").ok).toBeFalsy();
    expect(store.set("stage.zoom", 50).ok).toBeFalsy();
    // @ts-expect-error: appearance.style is global
    expect(store.set("appearance.style", "classic", "work").ok).toBeFalsy();
    expect(changes).toStrictEqual([]);
  });

  it("seeds a page and pushes it each change, with the stored value", async () => {
    const { store, registrar } = await setup({
      global: { "appearance.style": "classic" },
    });
    expect(registrar.call(channels.snapshot, {}, 7)).toStrictEqual({
      ok: true,
      value: { global: { "appearance.style": "classic" }, profiles: {} },
    });
    store.set("appearance.style", undefined);
    expect(
      registrar.call(
        channels.set,
        { key: "stage.zoom", profileId: "work", value: 3 },
        7
      )
    ).toStrictEqual({ ok: true, value: null });
    expect(registrar.pushes).toStrictEqual([
      {
        channel: "settings.changed",
        contentsId: 7,
        payload: {
          changes: [
            { key: "appearance.style", profileId: null, value: undefined },
          ],
        },
      },
      {
        channel: "settings.changed",
        contentsId: 7,
        payload: {
          changes: [{ key: "stage.zoom", profileId: "work", value: 3 }],
        },
      },
    ]);
  });

  it("answers a page's bad value with the reason", async () => {
    const { registrar } = await setup();
    expect(
      registrar.call(channels.set, { key: "stage.zoom", value: "big" }, 7)
    ).toMatchObject({ ok: false });
  });
});

describe("a settings file edited by hand", () => {
  it("applies the edit and tells subscribers what changed", async () => {
    const { store, fs, clock, changes } = await setup(
      { global: { "appearance.style": "modern" } },
      { watchFile: true }
    );
    fs.edit(
      SETTINGS_FILE,
      file({
        global: { "appearance.style": "classic" },
        profiles: { work: { "stage.zoom": 2 } },
      })
    );
    fs.edit(SETTINGS_FILE, fs.files.get(SETTINGS_FILE) ?? "");
    clock.advance(50);
    await vi.waitFor(() => {
      expect(changes).toStrictEqual([
        [
          { key: "appearance.style", profileId: null },
          { key: "stage.zoom", profileId: "work" },
        ],
      ]);
    });
    expect(store.get("appearance.style")).toBe("classic");
    expect(fs.writes).toStrictEqual([]);
  });

  it("keeps what it has when the edit does not parse", async () => {
    const { store, fs, clock, changes } = await setup(
      { global: { "appearance.style": "classic" } },
      { watchFile: true }
    );
    fs.edit(SETTINGS_FILE, "{ half");
    clock.advance(50);
    await store.flush();
    expect(changes).toStrictEqual([]);
    expect(store.get("appearance.style")).toBe("classic");
  });

  it("is not watched unless asked", async () => {
    const { fs } = await setup({});
    expect(fs.watched).toBe(0);
  });
});
