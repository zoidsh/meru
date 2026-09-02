import { RUNTIME_PROXY_RELAY_START_GLOBAL } from "../runtime-proxy/bridge-protocol";
import { reachesClampedSite } from "./match-pattern";
import { findWebAccessiblePattern, type WebAccessibleResources } from "./web-accessible";

/** Only what the derive reads or rewrites is spelled out; the rest is carried. */
export type ExtensionManifest = {
  [manifestKey: string]: unknown;
  name?: string;
  version?: string;
  key?: string;
  permissions?: string[];
  background?: {
    service_worker?: string;
    type?: string;
  };
  content_security_policy?: {
    extension_pages?: string;
    sandbox?: string;
  };
  content_scripts?: ({ matches?: string[] } & { [contentScriptKey: string]: unknown })[];
  web_accessible_resources?: WebAccessibleResources;
};

export type DerivedManifest = {
  manifest: ExtensionManifest;
  serviceWorkerWrapper: string | null;
};

/**
 * A service worker that pulls in the facade before the extension's own
 * background script. Static imports are the only vehicle: `import()` is banned
 * in service workers, and a script injected any other way runs too late or, on
 * Electron 43, not at all (see the injection-vehicle notes in the feature doc).
 *
 * With the runtime proxy's relay in the list, the wrapper ends by asking it to
 * park its job stream, which is deliberately the last thing that happens.
 * Chrome dispatches nothing to a service worker until its script has finished
 * evaluating, so an extension calling `chrome.storage.setAccessLevel` at top
 * level has always run it before the first message arrives; a relay that
 * parked during its own module evaluation would take jobs before the
 * extension's top-level code had said who may reach its storage. In the module
 * form the imports are evaluated before this statement, top-level `await`
 * included, and in the classic form `importScripts` is synchronous, so the
 * ordering holds either way — and holds by construction rather than by the
 * accident of evaluation order it relied on before.
 */
function createServiceWorkerWrapper(
  facadeFileName: string,
  backgroundFileName: string,
  isModule: boolean,
  relayFileName?: string,
) {
  const header =
    "// Generated when the extension was derived, in place of its own service worker.\n";

  const wrappedFileNames = [facadeFileName, relayFileName, backgroundFileName].filter(
    (fileName): fileName is string => fileName !== undefined,
  );

  const footer =
    relayFileName === undefined ? "" : `globalThis.${RUNTIME_PROXY_RELAY_START_GLOBAL}?.();\n`;

  if (isModule) {
    return `${header}${wrappedFileNames.map((fileName) => `import "./${fileName}";\n`).join("")}${footer}`;
  }

  return `${header}importScripts(${wrappedFileNames.map((fileName) => `"/${fileName}"`).join(", ")});\n${footer}`;
}

/**
 * Permissions whose bindings Electron declares but ships no implementation for.
 * Chromium builds the namespace from the schema the moment anything touches it,
 * looks for the JavaScript module behind it, finds none and hits a NOTREACHED —
 * once for `webRequest` and once per event on it, in every extension context.
 * That is a `DumpWithoutCrashing` in the builds Meru ships and a fatal check in
 * others, and it costs the extension nothing to avoid: extension-side
 * `webRequest` listeners never receive a request in Electron, measured in the spike.
 *
 * Dropped from the derived copy, the namespace is missing rather than broken,
 * and the facade's noop `webRequest` stands in for it.
 */
const DROPPED_PERMISSIONS = new Set(["webRequest", "webRequestAuthProvider"]);

/**
 * Permissions that put an extension into Chromium's WebRequest proxy count.
 * Chromium proxies every URL loader factory built for the browser context as
 * soon as one loaded extension declares any of them, counted from the manifest
 * alone with no listener and no ruleset content required. Electron then hands
 * it a browser process factory as a navigation with a null `RenderFrameHost`
 * and `MaybeProxyURLLoaderFactory` dereferences it, which is a segfault rather
 * than an exception, so no caller can catch it. electron/electron#45050 carries
 * the one line that fixes it and has sat open and unmerged, so no upgrade
 * avoids this.
 *
 * Dropped so a main process `session.fetch` against an account session stays a
 * usable primitive. An account with no view has no other way to read its unread
 * feed, which is what the hibernation and lazy view work is built on.
 *
 * The cost is 1Password's rules, which scrub `user-agent`, `accept-language`
 * and `origin` from its DNS-over-HTTPS lookups and from the
 * `/.well-known/webauthn` request behind related-origin passkeys. Every rule it
 * ships is `modifyHeaders`, so nothing it asks for stops being requested, and
 * its own call site reads the namespace through `?.` and carries on without it.
 */
const DROPPED_NETWORK_PERMISSIONS = new Set([
  "declarativeWebRequest",
  "declarativeNetRequest",
  "declarativeNetRequestWithHostAccess",
  "declarativeNetRequestFeedback",
]);

/**
 * The rulesets those permissions carry. Chromium rejects a manifest declaring
 * `declarative_net_request` without a permission to match, so the key has to go
 * with them rather than be left behind as a load error.
 */
const DROPPED_MANIFEST_KEYS = ["declarative_net_request"];

function derivePermissions(permissions: ExtensionManifest["permissions"]) {
  return permissions?.filter(
    (permission) =>
      !DROPPED_PERMISSIONS.has(permission) && !DROPPED_NETWORK_PERMISSIONS.has(permission),
  );
}

function parseDirectives(contentSecurityPolicy: string) {
  return contentSecurityPolicy
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean);
}

function findDirective(directives: string[], name: string) {
  return directives.findIndex((directive) => new RegExp(`^${name}(\\s|$)`, "i").test(directive));
}

/**
 * Widens `connect-src` so the facade can reach the bridge. An extension's own
 * policy governs its service worker as much as its pages, and one that pins
 * `connect-src` — 1Password pins it to its own hosts — would otherwise block
 * the only transport extension contexts have into the main process.
 *
 * Only `connect-src` moves, and only by this one scheme: what the extension
 * may load, execute or frame is left exactly as its author wrote it.
 */
export function allowConnectSource(contentSecurityPolicy: string, source: string) {
  const directives = parseDirectives(contentSecurityPolicy);

  const connectIndex = findDirective(directives, "connect-src");

  if (connectIndex !== -1) {
    const connectDirective = directives[connectIndex] as string;

    if (connectDirective.split(/\s+/).includes(source)) {
      return contentSecurityPolicy;
    }

    directives[connectIndex] = `${connectDirective} ${source}`;

    return directives.join("; ");
  }

  const defaultIndex = findDirective(directives, "default-src");

  // Without either directive nothing restricts connections in the first place
  if (defaultIndex === -1) {
    return contentSecurityPolicy;
  }

  const inheritedSources = (directives[defaultIndex] as string)
    .split(/\s+/)
    .slice(1)
    // `'none'` alongside another source is ignored rather than obeyed
    .filter((inheritedSource) => inheritedSource !== "'none'");

  directives.push(`connect-src ${[...inheritedSources, source].join(" ")}`);

  return directives.join("; ");
}

function deriveContentSecurityPolicy(
  manifest: ExtensionManifest,
  bridgeConnectSource: string,
): ExtensionManifest["content_security_policy"] {
  const extensionPages = manifest.content_security_policy?.extension_pages;

  if (!extensionPages) {
    return manifest.content_security_policy;
  }

  return {
    ...manifest.content_security_policy,
    extension_pages: allowConnectSource(extensionPages, bridgeConnectSource),
  };
}

/**
 * How a derived copy takes part in one shared extension instance across
 * sessions. The `worker` copy keeps the extension whole and additionally runs
 * the runtime proxy's relay client next to its service worker; the
 * `contentScriptOnly` copy loses its `background` key entirely — Electron still
 * injects its content scripts (measured 2026-08-25) — and gets the proxy's shim
 * prepended to every one of them, so its `chrome.runtime` messaging reaches the
 * one worker instead of a receiving end that does not exist. Its extension
 * pages are shimmed too, which is the derive's own job rather than the
 * manifest's.
 */
export type SharedInstanceManifestOptions =
  | { role: "worker"; relayFileName: string }
  | { role: "contentScriptOnly"; shimFileName: string };

/**
 * Runs the shim ahead of the extension's own scripts in every content script
 * entry, in the same isolated world, which is what lets it shadow
 * `chrome.runtime.sendMessage` and `connect` before any extension code reads
 * them. Entries without scripts — CSS-only ones — have nothing to shadow.
 */
function prependContentScriptShim(
  contentScripts: ExtensionManifest["content_scripts"],
  shimFileName: string,
) {
  return contentScripts?.map((contentScript) =>
    Array.isArray(contentScript.js)
      ? { ...contentScript, js: [shimFileName, ...contentScript.js] }
      : contentScript,
  );
}

/**
 * Narrows where the extension's content scripts run. Electron has no per-site
 * extension controls, so the manifest is the only lever: an extension declaring
 * `<all_urls>` injects into every frame of every view otherwise.
 *
 * Each entry is clamped to the sites it already reached, and an entry that
 * reached none of them is dropped rather than rewritten. Writing the clamp over
 * every entry alike would widen the ones an author aimed at other sites: five of
 * 1Password's eight entries name its own web app, Kolide, director.ai and
 * autofill.me, and being handed the clamp put 427 KB of scripts that never ran
 * on a Google page on every one of them.
 *
 * Every surviving entry keeps the rest of what its author wrote — which scripts
 * run, when they run, which frames they reach — and only the sites change.
 */
function deriveContentScripts(
  contentScripts: ExtensionManifest["content_scripts"],
  matches: string[] | undefined,
) {
  if (!contentScripts || !matches) {
    return contentScripts;
  }

  const clampedContentScripts: NonNullable<ExtensionManifest["content_scripts"]> = [];

  for (const contentScript of contentScripts) {
    // An entry with no patterns of its own runs nowhere, so there is nothing to
    // narrow and nothing the clamp could hand it without inventing reach
    const clampedMatches = matches.filter((clampPattern) =>
      contentScript.matches?.some((contentScriptPattern) =>
        reachesClampedSite(contentScriptPattern, clampPattern),
      ),
    );

    if (clampedMatches.length === 0) {
      continue;
    }

    clampedContentScripts.push({ ...contentScript, matches: clampedMatches });
  }

  return clampedContentScripts;
}

/**
 * Points the manifest's service worker at a generated wrapper, lets its content
 * security policy reach the native messaging bridge, clamps its content scripts
 * to the sites they may run on, and drops both the permissions Electron cannot
 * serve and the ones that arm the extensions WebRequest proxy.
 * Everything else is carried over untouched — `key`
 * above all, since without it Chromium derives the extension id from the
 * directory it was loaded from and the derived copy would answer to a different
 * id than the extension it came from.
 */
export function deriveManifest(
  manifest: ExtensionManifest,
  {
    facadeFileName,
    serviceWorkerFileName,
    bridgeConnectSource,
    strippedManifestKeys = [],
    contentScriptMatches,
    sharedInstance,
  }: {
    facadeFileName: string;
    serviceWorkerFileName: string;
    bridgeConnectSource: string;
    /** Manifest keys to leave out of the copy, such as `content_scripts`. */
    strippedManifestKeys?: string[];
    /**
     * Match patterns to write over every content script's own. Without them the
     * extension's content scripts run wherever its author declared.
     */
    contentScriptMatches?: string[];
    /**
     * The copy's part in one shared instance across sessions, or `undefined`
     * for the ordinary copy every session gets its own instance of.
     */
    sharedInstance?: SharedInstanceManifestOptions;
  },
): DerivedManifest {
  const clampedContentScripts = deriveContentScripts(
    manifest.content_scripts,
    contentScriptMatches,
  );

  const derivedManifest: ExtensionManifest = {
    ...manifest,
    permissions: derivePermissions(manifest.permissions),
    content_security_policy: deriveContentSecurityPolicy(manifest, bridgeConnectSource),
    content_scripts:
      sharedInstance?.role === "contentScriptOnly"
        ? prependContentScriptShim(clampedContentScripts, sharedInstance.shimFileName)
        : clampedContentScripts,
  };

  for (const droppedManifestKey of DROPPED_MANIFEST_KEYS) {
    delete derivedManifest[droppedManifestKey];
  }

  for (const strippedManifestKey of strippedManifestKeys) {
    delete derivedManifest[strippedManifestKey];
  }

  // The facade copy carries the bridge token, which only holds as a secret
  // while nothing outside the extension can fetch it. Today no curated
  // extension's `web_accessible_resources` comes near the facade, but an update
  // widening a pattern to `*.js` would hand the token to every page in the
  // session — refusing to derive is what keeps that an outage instead of a leak
  const sharedInstanceFileName =
    sharedInstance?.role === "contentScriptOnly"
      ? sharedInstance.shimFileName
      : sharedInstance?.relayFileName;

  for (const derivedFileName of [facadeFileName, serviceWorkerFileName, sharedInstanceFileName]) {
    if (derivedFileName === undefined) {
      continue;
    }

    const exposingPattern = findWebAccessiblePattern(
      derivedManifest.web_accessible_resources,
      derivedFileName,
    );

    if (exposingPattern) {
      throw new Error(
        `web_accessible_resources pattern "${exposingPattern}" makes "${derivedFileName}" fetchable by web pages`,
      );
    }
  }

  // The whole `background` key goes, not just the worker: a copy meant to run
  // no worker must not leave Chromium anything to start. `strippedManifestKeys`
  // cannot express this, since the wrapper branch below re-adds `background`
  // after the strip — which is also why this is its own explicit option.
  if (sharedInstance?.role === "contentScriptOnly") {
    delete derivedManifest.background;

    return { manifest: derivedManifest, serviceWorkerWrapper: null };
  }

  const backgroundFileName = manifest.background?.service_worker?.replace(/^\//, "");

  if (!backgroundFileName) {
    return { manifest: derivedManifest, serviceWorkerWrapper: null };
  }

  return {
    manifest: {
      ...derivedManifest,
      background: { ...manifest.background, service_worker: serviceWorkerFileName },
    },
    serviceWorkerWrapper: createServiceWorkerWrapper(
      facadeFileName,
      backgroundFileName,
      manifest.background?.type === "module",
      sharedInstance?.role === "worker" ? sharedInstance.relayFileName : undefined,
    ),
  };
}
