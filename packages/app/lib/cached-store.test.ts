import { afterEach, describe, expect, mock, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// electron-store asks Electron's `app` for a default directory, which every
// store here replaces with `cwd`.
mock.module("electron", () => ({ default: {} }));

const { CachedStore } = await import("./cached-store");

type TestConfig = {
  "theme.name": string;
  accounts: { id: string; selected: boolean; name?: string }[];
};

const defaults: TestConfig = {
  "theme.name": "light",
  accounts: [
    { id: "a", selected: false },
    { id: "b", selected: false },
  ],
};

const directories: string[] = [];

function createStore(
  options: Partial<ConstructorParameters<typeof CachedStore<TestConfig>>[0]> = {},
) {
  const cwd = mkdtempSync(path.join(tmpdir(), "cached-store-"));
  directories.push(cwd);

  return new CachedStore<TestConfig>({
    cwd,
    accessPropertiesByDotNotation: false,
    defaults: structuredClone(defaults),
    ...options,
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("CachedStore", () => {
  test("returns what was written", () => {
    const store = createStore();

    store.set("theme.name", "dark");

    expect(store.get("theme.name")).toBe("dark");
    expect(JSON.parse(readFileSync(store.path, "utf8"))["theme.name"]).toBe("dark");
  });

  test("serves reads from memory rather than the file", () => {
    const store = createStore();

    store.set("theme.name", "dark");

    const file = JSON.parse(readFileSync(store.path, "utf8"));
    writeFileSync(store.path, JSON.stringify({ ...file, "theme.name": "edited" }));

    expect(store.get("theme.name")).toBe("dark");
    expect(store.store["theme.name"]).toBe("dark");
  });

  test("reports a change made to a value it handed out", () => {
    const store = createStore();
    const changes: [unknown, unknown][] = [];

    store.onDidChange("accounts", (newValue, oldValue) => {
      changes.push([newValue, oldValue]);
    });

    const accounts = store.get("accounts");
    for (const account of accounts) {
      account.selected = account.id === "a";
    }
    store.set("accounts", accounts);

    expect(changes).toEqual([
      [
        [
          { id: "a", selected: true },
          { id: "b", selected: false },
        ],
        defaults.accounts,
      ],
    ]);
    expect(store.get("accounts")).toEqual(accounts);
  });

  test("keeps a value apart from the object it was set from", () => {
    const store = createStore();
    const account = { id: "c", selected: true };

    store.set("accounts", [account]);
    account.selected = false;

    expect(store.get("accounts")).toEqual([{ id: "c", selected: true }]);
  });

  test("tells any-change listeners the new value", () => {
    const store = createStore();
    const themes: [string | undefined, string | undefined][] = [];

    store.onDidAnyChange((newValue, oldValue) => {
      themes.push([newValue?.["theme.name"], oldValue?.["theme.name"]]);
    });

    store.set("theme.name", "dark");

    expect(themes).toEqual([["dark", "light"]]);
  });

  test("clears back to the defaults", () => {
    const store = createStore();

    store.set("theme.name", "dark");
    store.set("accounts", []);
    store.clear();

    expect(store.get("theme.name")).toBe("light");
    expect(store.get("accounts")).toEqual(defaults.accounts);
  });

  test("hands out copies of nested values from the whole store", () => {
    const store = createStore();

    for (const account of store.store.accounts) {
      account.selected = true;
    }

    expect(store.get("accounts")).toEqual(defaults.accounts);
  });

  test("holds what the file holds", () => {
    const store = createStore();
    const changes: unknown[] = [];

    store.onDidChange("accounts", (newValue) => {
      changes.push(newValue);
    });

    store.set("accounts", [{ id: "c", selected: true, name: undefined }]);

    expect(store.get("accounts")).toStrictEqual([{ id: "c", selected: true }]);

    store.set("accounts", [{ id: "c", selected: true }]);

    expect(changes).toHaveLength(1);
  });

  test("leaves the cache alone when a write fails", () => {
    const store = createStore();

    chmodSync(path.dirname(store.path), 0o500);

    try {
      expect(() => store.set("theme.name", "dark")).toThrow();
    } finally {
      chmodSync(path.dirname(store.path), 0o700);
    }

    expect(store.get("theme.name")).toBe("light");
  });

  test("serves what the migrations wrote", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "cached-store-"));
    directories.push(cwd);
    writeFileSync(
      path.join(cwd, "config.json"),
      JSON.stringify({
        ...defaults,
        theme: "dark",
        __internal__: { migrations: { version: "1.0.0" } },
      }),
    );

    const store = createStore({
      cwd,
      projectVersion: "2.0.0",
      migrations: {
        "2.0.0": (migrating) => {
          // @ts-expect-error: `theme` is now `theme.name`
          migrating.set("theme.name", migrating.get("theme"));
        },
      },
    });

    expect(store.get("theme.name")).toBe("dark");
    expect(JSON.parse(readFileSync(store.path, "utf8"))["theme.name"]).toBe("dark");
  });
});
