import type { ChromeNamespace } from "../facade/lib/chrome";

/**
 * SPIKE: shadows the worker's `chrome.scripting.executeScript` so that a target
 * in a session the worker has no tabs in is answered success instead of
 * Chromium's "No tab with id".
 *
 * Chromium resolves `executeScript`'s `target.tabId` inside the asking
 * extension's own `BrowserContext`, so from the default session every account
 * tab is unknown. There is no Electron API to execute into another session's
 * extension isolated world, and the shim cannot load the file itself: measured
 * on 43.7.7, a content script's isolated world cannot `fetch` or
 * dynamic-`import` an extension file that is not web-accessible, and `eval` and
 * `new Function` are refused by the extension's own CSP.
 *
 * So the file is declared as a static content script in the content-script-only
 * copy instead, and this answers the worker's call for a script that is already
 * there. It is a lie with a cost: the worker believes the script it named was
 * injected, where what runs is whatever the derive declared.
 *
 * Only a failure Chromium raises for an unknown tab is absorbed. A real error —
 * a file that is not in the package, a target the extension has no permission
 * for — still reaches the extension, since answering success for those would
 * hide a broken package behind a working-looking fill.
 */
const NO_TAB_MESSAGE = /No tab with id/;

type InjectionResult = { frameId: number; documentId?: string; result: unknown };

export function wrapScripting(extensionApi: ChromeNamespace) {
  const scripting = extensionApi.scripting as ChromeNamespace | undefined;

  if (!scripting) {
    return;
  }

  const nativeExecuteScript = scripting.executeScript as
    | ((injection: Record<string, unknown>) => Promise<InjectionResult[]>)
    | undefined;

  if (typeof nativeExecuteScript !== "function") {
    return;
  }

  scripting.executeScript = async function executeScript(injection: Record<string, unknown>) {
    try {
      return await nativeExecuteScript.call(scripting, injection);
    } catch (error) {
      if (!NO_TAB_MESSAGE.test(String((error as Error)?.message ?? error))) {
        throw error;
      }

      const target = (injection.target ?? {}) as { frameIds?: number[] };

      const frameIds = target.frameIds?.length ? target.frameIds : [0];

      console.debug(
        "[Meru] executeScript answered from the derived copy's static content scripts",
        injection.files ?? injection.func,
      );

      return frameIds.map((frameId) => ({ frameId, result: undefined }));
    }
  };
}
