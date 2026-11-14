import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

import { BRIDGE_KEY } from "../../core/ports.ts";
import type { RendererBridge } from "../../core/ports.ts";
import type { Platform } from "../../core/records/platform.ts";
import type { Allowlist } from "../../shared/channels/define.ts";

const refuse = (channel: string): never => {
  throw new Error(`${channel} is not a channel this page may use`);
};

export const exposeBridge = (platform: Platform, allowed: Allowlist): void => {
  const bridge: RendererBridge = {
    invoke: async (channel, payload) => {
      if (!allowed.invoke.has(channel)) {
        refuse(channel);
      }
      const result: unknown = await ipcRenderer.invoke(channel, payload);
      return result;
    },
    on: (channel, listener) => {
      if (!allowed.push.has(channel)) {
        refuse(channel);
      }
      const forward = (_event: IpcRendererEvent, payload: unknown) => {
        listener(payload);
      };
      ipcRenderer.on(channel, forward);
      return () => {
        ipcRenderer.off(channel, forward);
      };
    },
    platform,
    send: (channel, payload) => {
      if (!allowed.event.has(channel)) {
        refuse(channel);
      }
      ipcRenderer.send(channel, payload);
    },
    sendSync: (channel, payload) => {
      if (!allowed.sync.has(channel)) {
        refuse(channel);
      }
      const result: unknown = ipcRenderer.sendSync(channel, payload);
      return result;
    },
  };
  contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
};
