import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import path from "node:path";
import { queryWindowsRegistryHostManifestPaths } from "./windows-registry";

/**
 * The manifest a native messaging host installs so browsers can find it:
 * https://developer.chrome.com/docs/apps/nativeMessaging.
 */
export type NativeMessagingHostManifest = {
  name: string;
  description?: string;
  path: string;
  type: string;
  allowed_origins: string[];
};

export type FoundNativeMessagingHost = {
  manifestPath: string;
  manifest: NativeMessagingHostManifest;
};

/**
 * Where the Chromium browsers keep host manifests, user-level directory first
 * the way Chromium searches. Hosts install themselves for the browsers they
 * find, and Meru is not one of them, so what it reads are other browsers'
 * registrations — the manifests 1Password's desktop app wrote for Chrome are
 * how Meru reaches it at all.
 */
const CHROMIUM_HOST_DIRECTORIES: Record<string, { user: string[]; system: string[] }> = {
  linux: {
    user: [
      ".config/google-chrome/NativeMessagingHosts",
      ".config/chromium/NativeMessagingHosts",
      ".config/microsoft-edge/NativeMessagingHosts",
      ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
      ".config/vivaldi/NativeMessagingHosts",
    ],
    system: [
      "/etc/opt/chrome/native-messaging-hosts",
      "/etc/chromium/native-messaging-hosts",
      "/etc/opt/edge/native-messaging-hosts",
    ],
  },
  darwin: {
    user: [
      "Library/Application Support/Google/Chrome/NativeMessagingHosts",
      "Library/Application Support/Chromium/NativeMessagingHosts",
      "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
      "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
      "Library/Application Support/Vivaldi/NativeMessagingHosts",
    ],
    system: [
      "/Library/Google/Chrome/NativeMessagingHosts",
      "/Library/Application Support/Chromium/NativeMessagingHosts",
      "/Library/Microsoft/Edge/NativeMessagingHosts",
    ],
  },
};

/**
 * Windows keeps no manifest directories: the registry holds the path to each
 * manifest, under the same per-browser split of user and machine scope.
 */
export const WINDOWS_HOST_REGISTRY_KEYS = [
  "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
  "HKCU\\Software\\Chromium\\NativeMessagingHosts",
  "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
  "HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts",
  "HKCU\\Software\\Vivaldi\\NativeMessagingHosts",
  "HKLM\\Software\\Google\\Chrome\\NativeMessagingHosts",
  "HKLM\\Software\\Chromium\\NativeMessagingHosts",
  "HKLM\\Software\\Microsoft\\Edge\\NativeMessagingHosts",
];

export type HostManifestSearchOptions = {
  platform?: string;
  homeDir?: string;
};

/**
 * The manifest paths to try, in order. Empty on Windows, where the paths come
 * out of the registry instead.
 */
export function getHostManifestSearchPaths(
  hostName: string,
  { platform: osPlatform = platform(), homeDir = homedir() }: HostManifestSearchOptions = {},
) {
  const directories = CHROMIUM_HOST_DIRECTORIES[osPlatform];

  if (!directories) {
    return [];
  }

  return [
    ...directories.user.map((directory) => path.join(homeDir, directory)),
    ...directories.system,
  ].map((directory) => path.join(directory, `${hostName}.json`));
}

/**
 * A host name is a file name and a registry key on the way to a manifest, so
 * only what Chrome documents as a host name is ever looked up: lowercase
 * alphanumerics, underscores and dots, no leading, trailing or doubled dot.
 */
export function isValidHostName(hostName: string) {
  return /^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(hostName);
}

export function parseHostManifest(source: string, hostName: string): NativeMessagingHostManifest {
  // A manifest off disk. The fields the connection turns on — `name`, `type`,
  // `path` and `allowed_origins` — are checked below; `description` is carried
  // through as whatever it was.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const manifest = JSON.parse(source) as Partial<NativeMessagingHostManifest>;

  if (manifest.name !== hostName) {
    throw new Error(`Host manifest names "${manifest.name}", not "${hostName}"`);
  }

  if (manifest.type !== "stdio") {
    throw new Error(`Host manifest type "${manifest.type}" is not supported`);
  }

  if (typeof manifest.path !== "string" || manifest.path.length === 0) {
    throw new Error("Host manifest has no path");
  }

  if (!Array.isArray(manifest.allowed_origins)) {
    throw new TypeError("Host manifest has no allowed_origins");
  }

  return {
    name: manifest.name,
    description: manifest.description,
    // Chrome resolves a relative path against the manifest's own directory
    path: manifest.path,
    type: manifest.type,
    allowed_origins: manifest.allowed_origins,
  };
}

export function getExtensionOrigin(extensionId: string) {
  return `chrome-extension://${extensionId}/`;
}

/**
 * Whether the host itself accepts this extension. The check is the host's, not
 * the browser's — it is how a host declares which extensions can drive it, and
 * skipping it would give every loaded extension every host on the machine.
 */
export function isExtensionAllowed(manifest: NativeMessagingHostManifest, extensionId: string) {
  return manifest.allowed_origins.includes(getExtensionOrigin(extensionId));
}

/** Absolute, so the host is spawned from where its manifest says it lives. */
export function resolveHostPath(manifestPath: string, manifest: NativeMessagingHostManifest) {
  return path.resolve(path.dirname(manifestPath), manifest.path);
}

async function readHostManifest(manifestPath: string, hostName: string) {
  try {
    return parseHostManifest(await readFile(manifestPath, "utf8"), hostName);
  } catch {
    return undefined;
  }
}

/**
 * The first readable manifest for this host name, or nothing. A manifest that
 * fails to parse is passed over rather than thrown on, so one broken
 * registration in an early directory cannot hide a working one behind it.
 */
export async function findHostManifest(
  hostName: string,
  options: HostManifestSearchOptions = {},
): Promise<FoundNativeMessagingHost | undefined> {
  if (!isValidHostName(hostName)) {
    return undefined;
  }

  const manifestPaths =
    (options.platform ?? platform()) === "win32"
      ? await queryWindowsRegistryHostManifestPaths(hostName, WINDOWS_HOST_REGISTRY_KEYS)
      : getHostManifestSearchPaths(hostName, options);

  for (const manifestPath of manifestPaths) {
    const manifest = await readHostManifest(manifestPath, hostName);

    if (manifest) {
      return { manifestPath, manifest };
    }
  }

  return undefined;
}
