import { describe, expect, it, vi } from "vitest";

import type { Fallback } from "../../../core/engines/settings-parse.ts";
import type { SettingChange } from "../../../core/engines/settings.ts";
import { wireName } from "../../../shared/channels/define.ts";
import type { RequestChannel } from "../../../shared/channels/define.ts";
import { settings as channels } from "../../../shared/channels/settings.ts";
import { rendererSurface } from "../../../shared/channels/surfaces.ts";
import type { registry } from "../../../shared/settings/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { SETTINGS_FILE, SettingsStore } from "./index.ts";

const file = (data: unknown) => JSON.stringify({ data, version: 1 });

const PAGE = 7;

const rethrow = (error: unknown) => {
  throw error;
};

const setup = async (
  data?: unknown,
  { watchFile = false }: { watchFile?: boolean } = {}
) => {
  const fs = new FakeFs(
    data === undefined ? {} : { [SETTINGS_FILE]: file(data) }
  );
  const clock = new FakeClock();
  const lifecycle = new FakeLifecycle();
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ onError: rethrow, transport });
  registrar.assign(PAGE, rendererSurface);
  const call = (channel: RequestChannel, payload: unknown) =>
    registrar.dispatch(PAGE, wireName(channel), payload);
  const fallbacks: Fallback[] = [];
  const store = new SettingsStore({
    lifecycle,
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
  const changes: SettingChange<typeof registry>[][] = [];
  store.subscribe((changed) => {
    changes.push([...changed]);
  });
  return {
    call,
    changes,
    clock,
    fallbacks,
    fs,
    lifecycle,
    opened,
    store,
    transport,
  };
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

  it("starts from defaults and reports nothing when there is no file or an empty one", async () => {
    const missing = await setup();
    const empty = await setup({ global: {}, profiles: {} });
    expect([missing.opened.source, empty.opened.source]).toStrictEqual([
      "missing",
      "file",
    ]);
    expect([...missing.fallbacks, ...empty.fallbacks]).toStrictEqual([]);
    expect(missing.store.get("appearance.style")).toBe("modern");
  });

  it("says the whole file fell back when it does not parse", async () => {
    const fs = new FakeFs({ [SETTINGS_FILE]: "{ half" });
    const fallbacks: Fallback[] = [];
    await new SettingsStore({
      lifecycle: new FakeLifecycle(),
      clock: new FakeClock(),
      fs,
      onError: (error) => {
        throw error;
      },
      onFallback: (found) => {
        fallbacks.push(...found);
      },
      registrar: new IpcDispatcher({
        onError: rethrow,
        transport: new FakeIpcTransport(),
      }),
      watchFile: false,
    }).open();
    expect(fallbacks).toStrictEqual([
      { key: null, profileId: null, reason: "invalid" },
    ]);
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

  it("drops a removed profile's layer and writes the file without it", async () => {
    const { store, changes, fs } = await setup({
      global: {},
      profiles: { home: { "stage.zoom": 1.5 }, work: { "stage.zoom": 2 } },
    });
    store.removeProfile("work");
    store.removeProfile("gone");
    expect(changes).toStrictEqual([[{ key: "stage.zoom", profileId: "work" }]]);
    await store.flush();
    expect(stored(fs)).toStrictEqual({
      data: { global: {}, profiles: { home: { "stage.zoom": 1.5 } } },
      version: 1,
    });
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
    const { store, call, transport } = await setup({
      global: { "appearance.style": "classic" },
    });
    expect(call(channels.snapshot, {})).toStrictEqual({
      ok: true,
      value: { global: { "appearance.style": "classic" }, profiles: {} },
    });
    store.set("appearance.style", undefined);
    expect(
      call(channels.set, { key: "stage.zoom", profileId: "work", value: 3 })
    ).toStrictEqual({ ok: true, value: null });
    expect(transport.sent).toStrictEqual([
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
    const { call } = await setup();
    expect(
      call(channels.set, { key: "stage.zoom", value: "big" })
    ).toMatchObject({ error: { kind: "failed" }, ok: false });
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
