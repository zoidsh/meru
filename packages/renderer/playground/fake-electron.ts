import type { ElectronAPI, IpcRendererListener } from "@electron-toolkit/preload";
import { createDefaultConfig } from "@meru/shared/config";
import type { Config, IpcRendererEvent } from "@meru/shared/types";
import { getPlaygroundPlatform, PLAYGROUND_ACCOUNT_ID, type PlaygroundPlatform } from "./constants";
import type { IpcCall, IpcCallChannel, IpcInvokeReplies, Scenario, ScenarioEvent } from "./types";

/**
 * The part of the preload's API the renderer actually reaches for.
 * `window.electron` is typed as the whole exposed surface, so the fake names
 * the subset it answers for rather than stubbing the rest of it.
 */
type FakeElectronApi = {
  ipcRenderer: Pick<ElectronAPI["ipcRenderer"], "send" | "invoke" | "on" | "once">;
  process: Pick<ElectronAPI["process"], "platform">;
};

const platform = getPlaygroundPlatform(new URLSearchParams(window.location.search));

const downloadsLocations: Record<PlaygroundPlatform, string> = {
  darwin: "/Users/you/Downloads",
  linux: "/home/you/Downloads",
  win32: "C:\\Users\\you\\Downloads",
};

function createPlaygroundConfig(overrides: Partial<Config> | undefined): Config {
  return {
    ...createDefaultConfig({
      accountId: PLAYGROUND_ACCOUNT_ID,
      downloadsLocation: downloadsLocations[platform],
      trayEnabled: platform !== "darwin",
    }),
    ...overrides,
  };
}

let config = createPlaygroundConfig(undefined);

let invokeReplies: IpcInvokeReplies = {};

const rendererListeners = new Map<string, Set<IpcRendererListener>>();

const callListeners = new Set<(call: IpcCall) => void>();

/** Every renderer listener ignores its event argument, so a bare object serves. */
const rendererEvent = {} as Parameters<IpcRendererListener>[0];

/**
 * Pushes an event the way the main process does, through the listeners the
 * stores, the query cache, and the theme registered as they were imported.
 */
function emit(channel: string, args: unknown[]): void {
  const listeners = rendererListeners.get(channel);

  if (!listeners) {
    return;
  }

  // Over a copy: a `once` listener unsubscribes itself as it runs, and a
  // listener is free to subscribe another to the same channel.
  for (const listener of Array.from(listeners)) {
    listener(rendererEvent, ...args);
  }
}

export function emitRendererEvent<Channel extends keyof IpcRendererEvent>(
  channel: Channel,
  args: IpcRendererEvent[Channel],
): void {
  emit(channel, args);
}

/**
 * A scenario's events arrive as a union of channel-and-arguments pairs, which
 * only holds together while the two travel as one value — hence the object
 * rather than two arguments.
 */
export function pushScenarioEvent(event: ScenarioEvent): void {
  emit(event.channel, event.args);
}

function recordCall(call: IpcCall): void {
  for (const listener of Array.from(callListeners)) {
    listener(call);
  }
}

/** Watches what the rendered component asks the main process for. */
export function onIpcCall(listener: (call: IpcCall) => void): () => void {
  callListeners.add(listener);

  return () => {
    callListeners.delete(listener);
  };
}

/**
 * Puts the fake back into a scenario's starting state. The config is rebuilt
 * from the app's real defaults every time, so a scenario that overrides a key
 * can't leak it into the next one.
 */
export function applyScenario(scenario: Scenario): void {
  config = createPlaygroundConfig(scenario.config);

  invokeReplies = scenario.invoke ?? {};
}

const fakeElectron: FakeElectronApi = {
  ipcRenderer: {
    send(channel, ...args) {
      recordCall({ kind: "send", channel: channel as IpcCallChannel, args, unanswered: false });
    },
    invoke(channel, ...args) {
      if (channel === "config.getConfig") {
        recordCall({ kind: "invoke", channel, args, unanswered: false });

        return Promise.resolve(config);
      }

      /**
       * Stands in for the main process's config store, which answers
       * `config.getConfig` and pushes `config.configChanged` on every write. A
       * mutation in the playground therefore travels back through the real
       * query cache rather than doing nothing.
       */
      if (channel === "config.setConfig") {
        recordCall({ kind: "invoke", channel, args, unanswered: false });

        config = { ...config, ...(args[0] as Partial<Config>) };

        emitRendererEvent("config.configChanged", [config]);

        return Promise.resolve(undefined);
      }

      const invokeChannel = channel as keyof IpcInvokeReplies;

      recordCall({
        kind: "invoke",
        channel: invokeChannel,
        args,
        unanswered: !(invokeChannel in invokeReplies),
      });

      return Promise.resolve(invokeReplies[invokeChannel]);
    },
    on(channel, listener) {
      const listeners = rendererListeners.get(channel) ?? new Set();

      listeners.add(listener);

      rendererListeners.set(channel, listeners);

      return () => {
        listeners.delete(listener);
      };
    },
    once(channel, listener) {
      const unsubscribe = fakeElectron.ipcRenderer.on(channel, (...listenerArgs) => {
        unsubscribe();

        listener(...listenerArgs);
      });

      return unsubscribe;
    },
  },
  process: { platform },
};

// The renderer's stores, query cache, and theme all register `ipc.renderer.on`
// handlers as they are imported, so the fake has to be in place before any of
// them evaluates. `preview.html` loads this module in a script tag of its own,
// ahead of the entry point's, because a comment on an import would not survive
// the formatter's import sorting.
window.electron = fakeElectron as ElectronAPI;
