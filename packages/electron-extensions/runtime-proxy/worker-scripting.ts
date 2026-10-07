import { matchesUrl } from "../derive/match-pattern";
import { postBridge } from "../facade/lib/bridge";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { createBridgedMethod } from "../facade/lib/method";
import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationFrameDetails,
} from "../web-navigation/bridge-protocol";
import { noFrameError, type RuntimeProxyStaticContentScript } from "./bridge-protocol";
import { getNativeMethod } from "./native-api";

/** Chromium's refusal of a tab outside the worker's own browser context. */
const NO_TAB_ERROR = /^No tab with id\b/;

/**
 * Chrome's words for a frame the extension may not touch, which is what a frame
 * outside the content-script clamp is to an extension: Meru took that site away
 * from it. Bitwarden ignores exactly this message when it injects into every
 * frame of every tab, and would otherwise surface each such frame as an
 * uncaught rejection.
 */
export const HOST_ACCESS_ERROR =
  "Cannot access contents of the page. Extension manifest must request permission to access the respective host.";

type ScriptInjection = {
  target?: { tabId?: unknown; frameIds?: unknown; allFrames?: unknown; documentIds?: unknown };
  files?: unknown;
  world?: unknown;
};

type InjectionResult = { frameId: number; result: undefined };

/**
 * How an injection into another session's tab is answered: as run, where every
 * file is already running in every frame it names; Chrome's refusal of a frame
 * the scripts do not reach; or Chromium's own failure, for anything the static
 * content scripts say nothing about.
 */
export type StaticInjectionAnswer =
  | { status: "ran"; results: InjectionResult[] }
  | { status: "error"; message: string }
  | { status: "unanswered" };

async function getAllFrames(tabId: number) {
  try {
    const response = await postBridge(WEB_NAVIGATION_PATHS.getAllFrames, { details: { tabId } });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as WebNavigationFrameDetails[] | null;
  } catch {
    return null;
  }
}

function reachesFrame(
  staticContentScript: RuntimeProxyStaticContentScript,
  frame: WebNavigationFrameDetails,
) {
  return (
    (frame.frameId === 0 || staticContentScript.allFrames) &&
    staticContentScript.matches.some((pattern) => matchesUrl(pattern, frame.url)) &&
    !staticContentScript.excludeMatches.some((pattern) => matchesUrl(pattern, frame.url))
  );
}

/**
 * Answers an injection from the static content scripts of the copy the tab's
 * session loaded. A frame the injection names that the scripts do not reach
 * fails the whole call, as a frame Chrome may not touch does; `allFrames` keeps
 * the frames they reach and skips the rest, as Chrome's does.
 */
export async function answerFromStaticContentScripts(
  injection: ScriptInjection,
  staticContentScripts: RuntimeProxyStaticContentScript[],
  getFrames: (tabId: number) => Promise<WebNavigationFrameDetails[] | null> = getAllFrames,
): Promise<StaticInjectionAnswer> {
  const { target, files } = injection;

  const world = injection.world ?? "ISOLATED";

  if (
    typeof target?.tabId !== "number" ||
    target.documentIds !== undefined ||
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every((file) => typeof file === "string")
  ) {
    return { status: "unanswered" };
  }

  // Each file's static content scripts in the world it was asked for, and a
  // file with none is no file of this answer's to give
  const carriers = (files as string[]).map((file) =>
    staticContentScripts.filter(
      (staticContentScript) =>
        staticContentScript.world === world &&
        staticContentScript.files.includes(file.replace(/^\//, "")),
    ),
  );

  if (carriers.some((fileCarriers) => fileCarriers.length === 0)) {
    return { status: "unanswered" };
  }

  const frames = await getFrames(target.tabId);

  if (!frames) {
    return { status: "unanswered" };
  }

  const isReached = (frame: WebNavigationFrameDetails) =>
    carriers.every((fileCarriers) =>
      fileCarriers.some((staticContentScript) => reachesFrame(staticContentScript, frame)),
    );

  if (target.allFrames === true) {
    const reachedFrames = frames.filter(isReached);

    return reachedFrames.length === 0
      ? { status: "error", message: HOST_ACCESS_ERROR }
      : {
          status: "ran",
          results: reachedFrames.map((frame) => ({ frameId: frame.frameId, result: undefined })),
        };
  }

  const frameIds = Array.isArray(target.frameIds) ? target.frameIds : [0];

  const results: InjectionResult[] = [];

  for (const frameId of frameIds) {
    const frame = frames.find((candidate) => candidate.frameId === frameId);

    if (!frame) {
      return { status: "error", message: noFrameError(frameId, target.tabId) };
    }

    if (!isReached(frame)) {
      return { status: "error", message: HOST_ACCESS_ERROR };
    }

    results.push({ frameId: frame.frameId, result: undefined });
  }

  return { status: "ran", results };
}

/**
 * Shadows the worker's `chrome.scripting.executeScript` for a tab in another
 * session, where the files it names were declared as static content scripts
 * instead (`declaredContentScripts` on the derive).
 *
 * Chromium resolves `target.tabId` inside the worker's own browser context, so
 * every account tab fails with "No tab with id". Nothing can carry the file
 * across either: an account copy's isolated world can neither `fetch` nor
 * `import()` a file that is not web-accessible, and the extension's own CSP
 * refuses `eval`. So the worker is answered as though the script had run, for
 * the files that are already running there, and for nothing else.
 *
 * Only that one failure is ever answered over. A call into the worker's own
 * session, a file missing from the package, a `func` injection, a file no
 * static content script carries: each stays Chromium's, so a broken
 * declaration surfaces as the error it is rather than as a fill that silently
 * does nothing.
 *
 * What the worker cannot get is a script running twice: Chrome runs a file
 * again each time it is asked to, where here the one instance the page loaded
 * with is all there is. An extension that tears its content script down and
 * injects it again gets the teardown and not the injection.
 */
export function wrapScripting(
  extensionApi: ChromeNamespace,
  staticContentScripts: RuntimeProxyStaticContentScript[],
) {
  const scripting = extensionApi.scripting as ChromeNamespace | undefined;

  if (!scripting) {
    return;
  }

  const nativeExecuteScript = getNativeMethod(scripting, "executeScript");

  if (!nativeExecuteScript) {
    return;
  }

  scripting.executeScript = createBridgedMethod(async ([injection]) => {
    try {
      return await nativeExecuteScript(injection);
    } catch (error) {
      if (!NO_TAB_ERROR.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }

      const answer = await answerFromStaticContentScripts(
        (injection ?? {}) as ScriptInjection,
        staticContentScripts,
      );

      if (answer.status === "ran") {
        return answer.results;
      }

      throw answer.status === "error" ? new Error(answer.message) : error;
    }
  });
}
