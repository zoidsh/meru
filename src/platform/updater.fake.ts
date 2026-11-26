import type { ChannelOptions, UpdateEvent } from "#core/updates.ts";

import type { Updater } from "./updater.ts";

/**
 * An updater that records what it is asked: each check stays out until the
 * test sends an event that ends it, as the library's does.
 */
export const fakeUpdater = ({ canUpdate = true } = {}) => {
  const calls: string[] = [];
  const channels: ChannelOptions[] = [];
  const listeners: ((event: UpdateEvent, message?: string) => void)[] = [];
  let pending: PromiseWithResolvers<void> | undefined;

  const updater: Updater = {
    canUpdate: () => {
      calls.push("canUpdate");

      return canUpdate;
    },
    setChannel: (options) => {
      calls.push("setChannel");
      channels.push(options);
    },
    check: () => {
      calls.push("check");
      pending = Promise.withResolvers();

      return pending.promise;
    },
    quitAndInstall: () => {
      calls.push("quitAndInstall");
    },
    onEvent: (listener) => {
      calls.push("onEvent");
      listeners.push(listener);
    },
  };

  return {
    updater,
    calls,
    channels,
    checks: () => calls.filter((call) => call === "check").length,
    emit: async (event: UpdateEvent, message?: string) => {
      for (const listener of listeners) {
        listener(event, message);
      }

      if (event.kind !== "checking" && event.kind !== "downloaded") {
        pending?.resolve();
        pending = undefined;
        // Lets the check's settling run, as the library's would before
        // anything else.
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
};
