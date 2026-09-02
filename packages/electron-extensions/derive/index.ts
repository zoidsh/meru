import { createHash, randomUUID } from "node:crypto";
import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { EXTENSION_BRIDGE_SCHEME, EXTENSION_BRIDGE_TOKEN_GLOBAL } from "../bridge/protocol";
import { RUNTIME_PROXY_MANIFEST_GLOBAL } from "../runtime-proxy/bridge-protocol";
import { getExtensionIdFromManifestKey } from "./extension-id";
import { allowPageConnectSource, injectPageScripts } from "./html";
import {
  deriveManifest,
  type ExtensionManifest,
  type SharedInstanceManifestOptions,
} from "./manifest";

const MANIFEST_FILE_NAME = "manifest.json";

/** What the stamp next to a derived copy is called: `<derivedDir>.json`. */
const STAMP_FILE_EXTENSION = ".json";

const FACADE_FILE_NAME = "chrome-facade.js";

const SERVICE_WORKER_FILE_NAME = "chrome-facade-service-worker.js";

const RUNTIME_PROXY_SHIM_FILE_NAME = "chrome-runtime-proxy-shim.js";

const RUNTIME_PROXY_RELAY_FILE_NAME = "chrome-runtime-proxy-relay.js";

/**
 * What the copy's derived directory is called next to the ordinary copy's, so
 * the two exist side by side: one launch loads the full copy into the session
 * that keeps the worker and this one into every other session.
 */
const CONTENT_SCRIPT_ONLY_DIR_SUFFIX = "-content-scripts";

/** Bump whenever what is written into a derived copy changes. */
const DERIVE_VERSION = 9;

/**
 * The copy's part in one shared extension instance serving every session (see
 * `SharedInstanceManifestOptions` in `manifest.ts` for what each role changes
 * in the manifest). Each role's proxy script is bundled on its own, like the
 * facade, and written into the copy carrying the same bridge token.
 */
export type SharedInstanceDeriveOptions =
  | { role: "worker"; relayScriptPath: string }
  | { role: "contentScriptOnly"; shimScriptPath: string };

export type DeriveExtensionOptions = {
  /** The unpacked extension the embedder handed over, never written to. */
  sourceDir: string;
  derivedExtensionsDir: string;
  facadeScriptPath: string;
  /**
   * Manifest keys the copy is derived without, to run an extension with one of
   * its parts taken away — `content_scripts`, `declarative_net_request` — and
   * see what changes.
   */
  strippedManifestKeys?: string[];
  /**
   * Match patterns the extension's content scripts are clamped to, asked for by
   * the id the copy will be loaded as. An extension without a `manifest.key`
   * has no id to be recognised by and keeps the patterns its author declared.
   */
  getContentScriptMatches?: (extensionId: string) => string[] | undefined;
  /**
   * Derives the copy for its part in one shared instance across sessions.
   * Without it the copy carries no proxy script and keeps its worker — the
   * facade and the page policy that lets its calls through are the transport's
   * and go into every copy alike.
   */
  sharedInstance?: SharedInstanceDeriveOptions;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Digests the source tree from each file's path, size and mtime — never its
 * contents, since an extension runs to tens of megabytes and this happens on
 * every launch, and an edit always moves one of the two.
 *
 * Every entry is stat'd at once rather than one after another: this runs per
 * extension on every launch and Gmail's first navigation waits behind it, and
 * an extension of a few thousand files spent that wait on a round trip to the
 * disk per file. The digest is the same either way — the lines are sorted
 * before they are hashed — so a stamp written by an earlier version still
 * matches and no profile re-derives.
 */
async function hashSourceTree(sourceDir: string) {
  const entryNames = await readdir(sourceDir, { recursive: true });

  const fileEntries = await Promise.all(
    entryNames.map(async (entryName) => {
      const stats = await stat(path.join(sourceDir, entryName));

      if (!stats.isFile()) {
        return undefined;
      }

      const relativePath = entryName.split(path.sep).join("/");

      return `${relativePath}\0${stats.size}\0${stats.mtimeMs}`;
    }),
  );

  return hash(
    fileEntries
      .filter((fileEntry) => fileEntry !== undefined)
      .sort()
      .join("\n"),
  );
}

async function readStamp(stampPath: string) {
  try {
    return await readFile(stampPath, "utf8");
  } catch {
    return null;
  }
}

async function directoryExists(dirPath: string) {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

/** Chromium serves `Popup.HTM` as a page just as well, so the net is this wide. */
const PAGE_FILE_EXTENSIONS = new Set([".html", ".htm"]);

/**
 * Writes the loader's scripts into every page of the copy, and lets every page
 * through to the bridge. The facade calls the bridge from pages whatever the
 * copy's role — `connectNative` and the webNavigation queries go over it — and
 * a page's own `<meta>` policy governs alongside the manifest's widened one
 * with the stricter deciding, so a page declaring `default-src 'none'` — which
 * is what 1Password's popup declares — would refuse those calls however wide
 * the manifest was made. The shim rides only in the content-script-only copy,
 * which has no worker of its own to receive what its pages send.
 */
async function derivePages(
  derivedDir: string,
  sharedInstance: SharedInstanceDeriveOptions | undefined,
) {
  const isContentScriptOnly = sharedInstance?.role === "contentScriptOnly";

  const scriptUrls = [
    `/${FACADE_FILE_NAME}`,
    ...(isContentScriptOnly ? [`/${RUNTIME_PROXY_SHIM_FILE_NAME}`] : []),
  ];

  const fileNames = await readdir(derivedDir, { recursive: true });

  for (const fileName of fileNames) {
    if (!PAGE_FILE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
      continue;
    }

    const pagePath = path.join(derivedDir, fileName);

    const page = await readFile(pagePath, "utf8");

    const bridgeReachablePage = allowPageConnectSource(page, `${EXTENSION_BRIDGE_SCHEME}:`);

    await writeFile(pagePath, injectPageScripts(bridgeReachablePage, scriptUrls));
  }
}

/**
 * The manifest the worker role's copy carries, which is what the one shared
 * worker's own `chrome.runtime.getManifest()` returns and therefore the answer
 * every session has to agree on. The content-script-only copy embeds it in its
 * shim so that a context inspecting the extension does not find a `background`
 * key missing where the worker session finds one.
 *
 * Recomputed from the source manifest rather than read back off the worker
 * copy's directory: `deriveManifest` is pure, and the worker copy is derived by
 * whichever session adopted that role — a directory that may not exist yet when
 * this copy is derived, and does not exist at all on a launch where no session
 * has adopted it.
 *
 * Nothing has to invalidate it, since the shim script it rides in is rewritten
 * on every launch, below. Everything it is computed from — the source manifest,
 * the stripped keys, the clamp — is in the stamp regardless, so a copy is never
 * kept over a change to any of them either.
 */
function deriveWorkerRoleManifest({
  sourceManifest,
  strippedManifestKeys,
  contentScriptMatches,
}: {
  sourceManifest: ExtensionManifest;
  strippedManifestKeys: string[];
  contentScriptMatches: string[] | undefined;
}) {
  return deriveManifest(sourceManifest, {
    facadeFileName: FACADE_FILE_NAME,
    serviceWorkerFileName: SERVICE_WORKER_FILE_NAME,
    bridgeConnectSource: `${EXTENSION_BRIDGE_SCHEME}:`,
    strippedManifestKeys,
    contentScriptMatches,
    sharedInstance: { role: "worker", relayFileName: RUNTIME_PROXY_RELAY_FILE_NAME },
  }).manifest;
}

/**
 * Copies an unpacked extension into a directory the loader owns and adds the
 * `chrome.*` facade to it: the service worker gets a wrapper that pulls the
 * facade in ahead of the extension's background script, and every extension
 * page gets a script tag doing the same.
 *
 * The copy exists because the facade has to be part of the extension to run in
 * its contexts, and the directory the embedder handed over is not the loader's
 * to write to — it is a verified install, or a directory a developer is working
 * in. The copy sits at a path derived from the source path, so an extension
 * without a `manifest.key` keeps the same generated id across launches.
 *
 * The facade is written rather than copied so that this extension's copy can
 * carry the token its native messaging bridge requests are recognised by.
 */
export async function deriveExtension({
  sourceDir,
  derivedExtensionsDir,
  facadeScriptPath,
  strippedManifestKeys = [],
  getContentScriptMatches,
  sharedInstance,
}: DeriveExtensionOptions) {
  const manifestSource = await readFile(path.join(sourceDir, MANIFEST_FILE_NAME), "utf8");

  const sourceManifest = JSON.parse(manifestSource) as ExtensionManifest;

  const extensionId = getExtensionIdFromManifestKey(sourceManifest.key);

  const contentScriptMatches = extensionId ? getContentScriptMatches?.(extensionId) : undefined;

  const derivedDirName = `${hash(sourceDir).slice(0, 16)}${
    sharedInstance?.role === "contentScriptOnly" ? CONTENT_SCRIPT_ONLY_DIR_SUFFIX : ""
  }`;

  const derivedDir = path.join(derivedExtensionsDir, derivedDirName);

  const stampPath = `${derivedDir}${STAMP_FILE_EXTENSION}`;

  // The source is copied again when any of its files changes, which is what an
  // installed extension moving to a new version does and what a developer
  // working in an unpacked one does, and when what the derive makes of it
  // changes
  // `sharedInstanceRole` is `undefined` — and so absent from the JSON — for the
  // ordinary copy, which keeps its stamp what it was before roles existed
  const stamp = JSON.stringify({
    deriveVersion: DERIVE_VERSION,
    sourceDir,
    sourceTree: await hashSourceTree(sourceDir),
    strippedManifestKeys,
    contentScriptMatches,
    sharedInstanceRole: sharedInstance?.role,
  });

  // A stamp that matches while its copy is gone would otherwise skip the copy
  // and go on writing the facade into nothing, on this launch and every one
  // after it, since nothing but a copy moves the stamp back off a match
  if ((await readStamp(stampPath)) !== stamp || !(await directoryExists(derivedDir))) {
    await rm(derivedDir, { recursive: true, force: true });

    await rm(stampPath, { force: true });

    await cp(sourceDir, derivedDir, { recursive: true });

    const { manifest, serviceWorkerWrapper } = deriveManifest(sourceManifest, {
      facadeFileName: FACADE_FILE_NAME,
      serviceWorkerFileName: SERVICE_WORKER_FILE_NAME,
      bridgeConnectSource: `${EXTENSION_BRIDGE_SCHEME}:`,
      strippedManifestKeys,
      contentScriptMatches,
      sharedInstance: toSharedInstanceManifestOptions(sharedInstance),
    });

    await writeFile(path.join(derivedDir, MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2));

    if (serviceWorkerWrapper) {
      await writeFile(path.join(derivedDir, SERVICE_WORKER_FILE_NAME), serviceWorkerWrapper);
    }

    await derivePages(derivedDir, sharedInstance);

    await writeFile(stampPath, stamp);
  }

  // Always, so a rebuilt facade reaches copies that are otherwise up to date
  const bridgeToken = randomUUID();

  const writeTokenCarryingScript = async (
    fileName: string,
    scriptPath: string,
    extraGlobals: Record<string, unknown> = {},
  ) => {
    const globals = { [EXTENSION_BRIDGE_TOKEN_GLOBAL]: bridgeToken, ...extraGlobals };

    const preamble = Object.entries(globals)
      .map(([globalName, value]) => `globalThis.${globalName} = ${JSON.stringify(value)};\n`)
      .join("");

    await writeFile(
      path.join(derivedDir, fileName),
      `${preamble}${await readFile(scriptPath, "utf8")}`,
    );
  };

  await writeTokenCarryingScript(FACADE_FILE_NAME, facadeScriptPath);

  // The proxy scripts run where the facade never loads — the shim in content
  // scripts' isolated worlds — so each carries the token itself, the same way
  if (sharedInstance?.role === "worker") {
    await writeTokenCarryingScript(RUNTIME_PROXY_RELAY_FILE_NAME, sharedInstance.relayScriptPath);
  }

  if (sharedInstance?.role === "contentScriptOnly") {
    await writeTokenCarryingScript(RUNTIME_PROXY_SHIM_FILE_NAME, sharedInstance.shimScriptPath, {
      [RUNTIME_PROXY_MANIFEST_GLOBAL]: deriveWorkerRoleManifest({
        sourceManifest,
        strippedManifestKeys,
        contentScriptMatches,
      }),
    });
  }

  return { derivedDir, bridgeToken, extensionId };
}

function toSharedInstanceManifestOptions(
  sharedInstance: SharedInstanceDeriveOptions | undefined,
): SharedInstanceManifestOptions | undefined {
  if (!sharedInstance) {
    return undefined;
  }

  return sharedInstance.role === "worker"
    ? { role: "worker", relayFileName: RUNTIME_PROXY_RELAY_FILE_NAME }
    : { role: "contentScriptOnly", shimFileName: RUNTIME_PROXY_SHIM_FILE_NAME };
}

export type PruneDerivedExtensionsOptions = {
  derivedExtensionsDir: string;
  /**
   * The source directories still being loaded. A copy derived from anything
   * else is gone for good, since nothing but the source it names can recreate
   * it.
   */
  keptSourceDirs: string[];
};

async function readStampSourceDir(stampPath: string) {
  const stamp = await readStamp(stampPath);

  if (!stamp) {
    return undefined;
  }

  try {
    return (JSON.parse(stamp) as { sourceDir?: string }).sourceDir;
  } catch {
    return undefined;
  }
}

/**
 * Drops the derived copies of extensions the embedder no longer loads: the
 * version directory an update replaced, an extension the user opted out of, a
 * development extension whose folder is gone. Nothing points back from a copy
 * to its source but its stamp, so a copy without one is unaccounted for and
 * goes too.
 *
 * Meant to run once the embedder has its load list, which is also why it is
 * safe to delete: a copy still in use belongs to a source that is on the list.
 */
export async function pruneDerivedExtensions({
  derivedExtensionsDir,
  keptSourceDirs,
}: PruneDerivedExtensionsOptions) {
  let entryNames: string[];

  try {
    entryNames = await readdir(derivedExtensionsDir);
  } catch {
    return;
  }

  const derivedDirNames = new Set(
    entryNames.map((entryName) =>
      entryName.endsWith(STAMP_FILE_EXTENSION)
        ? entryName.slice(0, -STAMP_FILE_EXTENSION.length)
        : entryName,
    ),
  );

  for (const derivedDirName of derivedDirNames) {
    const derivedDir = path.join(derivedExtensionsDir, derivedDirName);

    const stampPath = `${derivedDir}${STAMP_FILE_EXTENSION}`;

    const sourceDir = await readStampSourceDir(stampPath);

    if (sourceDir !== undefined && keptSourceDirs.includes(sourceDir)) {
      continue;
    }

    await rm(derivedDir, { recursive: true, force: true });

    await rm(stampPath, { force: true });
  }
}
