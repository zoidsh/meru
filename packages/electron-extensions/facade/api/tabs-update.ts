import {
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyWorkerUpdateTabResult,
} from "../../runtime-proxy/bridge-protocol";
import { postBridge } from "../lib/bridge";
import type { ChromeNamespace } from "../lib/chrome";
import { defineMember, readMember } from "../lib/fill";
import { getLastErrorMessage } from "../lib/last-error";
import { createBridgedMethod } from "../lib/method";

type NativeUpdate = (...callArguments: unknown[]) => unknown;

/**
 * `chrome.tabs.update` in the worker and its pages, answered from main for an
 * account's tab (`runtime-proxy/worker-tabs.ts`).
 *
 * Electron's own `update` looks the id up in the worker's session, which holds
 * no account's tab, so it fails with "No such tab" for exactly the tab that
 * matters: Bitwarden hands focus back to the page a popout was for each time
 * one finishes, without waiting on the answer, so the failure is an uncaught
 * rejection in the worker.
 *
 * A tab of the worker's own session — a popout's page — is still Electron's to
 * update, and so is any call main could not be asked about.
 *
 * Only for an extension that opens windows (`OPENS_EXTENSION_WINDOWS_GLOBAL`),
 * since focus goes back to a tab when one of those windows is done; every other
 * extension keeps Electron's answer.
 */
export function proxyTabsUpdate(extensionApi: ChromeNamespace) {
  const tabs = readMember(extensionApi, "tabs") as ChromeNamespace | undefined;

  if (!tabs) {
    return;
  }

  const nativeUpdate = readMember(tabs, "update") as NativeUpdate | undefined;

  const updateNatively = (callArguments: unknown[]) =>
    new Promise((resolve, reject) => {
      if (typeof nativeUpdate !== "function") {
        reject(new Error("tabs.update is not available"));

        return;
      }

      nativeUpdate.call(tabs, ...callArguments, (tab: unknown) => {
        const error = getLastErrorMessage(extensionApi.runtime as ChromeNamespace);

        if (error === undefined) {
          resolve(tab);
        } else {
          reject(new Error(error));
        }
      });
    });

  defineMember(
    tabs,
    "update",
    createBridgedMethod(async (callArguments) => {
      // `update(updateProperties)` is the current tab's, `update(tabId, updateProperties)` names one
      const [tabId, updateProperties] =
        callArguments.length < 2 ? [undefined, callArguments[0]] : callArguments;

      const result = (await postBridge(RUNTIME_PROXY_PATHS.workerUpdateTab, {
        tabId,
        updateProperties,
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)) as RuntimeProxyWorkerUpdateTabResult | null;

      if (!result || result.status === "ownSession") {
        return updateNatively(callArguments);
      }

      if (result.status !== "tab") {
        throw new Error(result.error);
      }

      return result.tab;
    }),
  );
}
