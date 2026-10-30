import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Account } from "./account";

type Sent = { channel: string; payload: Array<Record<string, unknown>> };

let sent: Sent[] = [];

let accountConfigs: Array<{ id: string }> = [];

let attentionRequired = false;

let resolveRendererReady!: () => void;

const rendererReady = new Promise<void>((resolve) => {
  resolveRendererReady = resolve;
});

mock.module("@electron-toolkit/utils", () => ({ platform: { isMacOS: false } }));

mock.module("electron", () => ({ net: {}, powerMonitor: { on: () => {} }, session: {} }));

mock.module("./account", () => ({ Account: class {} }));

mock.module("./config", () => ({
  config: { get: () => accountConfigs, onDidChange: () => {} },
}));

mock.module("./extensions", () => ({ extensions: {} }));

mock.module("./ipc", () => ({
  ipc: {
    renderer: {
      send: (_webContents: unknown, channel: string, payload: Sent["payload"]) => {
        sent.push({ channel, payload });
      },
    },
  },
}));

mock.module("./license-key", () => ({ licenseKey: { isValid: true } }));

mock.module("./main", () => ({
  main: { rendererReady, window: { isDestroyed: () => false, webContents: {} } },
}));

mock.module("./tabs", () => ({ isWindowedTab: () => false }));

mock.module("./workspace-app", () => ({ WorkspaceApp: class {} }));

const { accounts } = await import("./accounts");

function addInstance(id: string) {
  accounts.instances.set(id, {
    gmail: { store: { getState: () => ({ attentionRequired }) } },
    tabs: { serialize: () => [] },
    verticalTabsWidth: null,
  } as unknown as Account);
}

beforeEach(() => {
  sent = [];
  accountConfigs = [];
  attentionRequired = false;
  accounts.instances.clear();
});

describe("accounts and tabs pushes to the renderer", () => {
  test("wait for the renderer, then send the state as it is then", async () => {
    accountConfigs = [{ id: "a" }];
    addInstance("a");

    const sends = [accounts.sendAccountsChangedToRenderer(), accounts.sendTabsChangedToRenderer()];

    expect(sent).toEqual([]);

    attentionRequired = true;
    resolveRendererReady();
    await Promise.all(sends);

    expect(sent.map(({ channel }) => channel).sort()).toEqual(["accounts.changed", "tabs.changed"]);
    expect(sent.find(({ channel }) => channel === "accounts.changed")?.payload).toMatchObject([
      { config: { id: "a" }, gmail: { attentionRequired: true } },
    ]);
  });

  test("skip an account whose instance is already gone", async () => {
    accountConfigs = [{ id: "a" }, { id: "removed" }];
    addInstance("a");
    resolveRendererReady();

    await accounts.sendAccountsChangedToRenderer();
    await accounts.sendTabsChangedToRenderer();

    expect(sent.find(({ channel }) => channel === "accounts.changed")?.payload).toMatchObject([
      { config: { id: "a" } },
    ]);
    expect(sent.find(({ channel }) => channel === "tabs.changed")?.payload).toEqual([
      { accountId: "a", tabs: [] },
    ]);
  });
});
