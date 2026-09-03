import type { ElectronAPI, IpcRendererListener } from "@electron-toolkit/preload";
import { createDefaultConfig } from "@meru/shared/config";
import type { Config, IpcRendererEvent } from "@meru/shared/types";
import {
  getPlaygroundPlatform,
  PLAYGROUND_ACCOUNT_ID,
  PLAYGROUND_SEARCH_PARAMS,
  type PlaygroundPlatform,
} from "./constants";
import { scenarios } from "./scenarios";
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

const searchParams = new URLSearchParams(window.location.search);

const platform = getPlaygroundPlatform(searchParams);

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

const scenarioId = searchParams.get(PLAYGROUND_SEARCH_PARAMS.scenario);

/**
 * The scenario is resolved and applied here rather than in the entry point,
 * because a renderer module is free to invoke as it evaluates — `lib/
 * extension-actions.ts` asks for the loaded extensions that way — and every
 * import in the entry point runs before its own first statement does. By the
 * time anything can ask, the answers are already in place.
 */
const resolvedScenario = scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0];

if (!resolvedScenario) {
  throw new Error("The playground has no scenarios to render");
}

export const playgroundScenario: Scenario = resolvedScenario;

let config = createPlaygroundConfig(playgroundScenario.config);

const invokeReplies: IpcInvokeReplies = playgroundScenario.invoke ?? {};

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
