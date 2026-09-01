import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The size the icon is picked for: browsers draw the toolbar button small, and
 * a display at twice that density is the common case.
 */
const ICON_SIZE = 32;

const ICON_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

type ActionManifestEntry = {
  default_icon?: string | Record<string, string>;
  default_popup?: string;
  default_title?: string;
};

/** The manifest keys the toolbar button is drawn from. */
export type ActionManifest = {
  /** Manifest v3. */
  action?: ActionManifestEntry;
  /** Manifest v2, where the same button was the browser action. */
  browser_action?: ActionManifestEntry;
  /** The extension's own icons, which the button falls back to. */
  icons?: Record<string, string>;
};

/** As much of an Electron `Extension` as an action is built from. */
export type ActionExtension = {
  id: string;
  name: string;
  path: string;
  manifest: ActionManifest;
};

/**
 * What an embedder needs to draw one extension's toolbar button.
 *
 * Everything here comes from the manifest and never changes while the extension
 * runs. Electron implements no part of `chrome.action`: it ships Chromium's
 * schema for the namespace with every function marked unsupported, so an
 * extension calling `setIcon`, `setBadgeText`, `setTitle` or `setPopup` changes
 * nothing and produces no state — there is nothing to read, and no event to
 * subscribe to. Dynamic action state would mean shadowing the namespace in the
 * facade and routing it back over IPC, which is a slice of its own.
 */
export type ExtensionAction = {
  extensionId: string;
  name: string;
  /** What the button says it is, which is what a tooltip shows. */
  title: string;
  /** The page the button opens, `null` for an extension that declares none. */
  popupUrl: string | null;
  /** The button's icon, ready for a renderer to draw. */
  iconDataUrl: string | null;
};

function getActionManifestEntry(manifest: ActionManifest) {
  return manifest.action ?? manifest.browser_action;
}

/**
 * Icon maps are keyed by pixel size, and the smallest that still covers the
 * size the icon is drawn at wins — scaling down beats scaling up — with the
 * largest declared icon as the floor.
 */
function pickIconPath(icons: Record<string, string> | undefined) {
  if (!icons) {
    return null;
  }

  const sizedIcons = Object.entries(icons)
    .map(([size, iconPath]) => ({ size: Number(size), iconPath }))
    .filter(({ size }) => Number.isFinite(size) && size > 0)
    .sort((a, b) => a.size - b.size);

  const pickedIcon = sizedIcons.find(({ size }) => size >= ICON_SIZE) ?? sizedIcons.at(-1);

  return pickedIcon?.iconPath ?? null;
}

/**
 * The icon a browser would draw on the button: the action's own icon, or the
 * extension's icons when the action declares none — which is what 1Password
 * does.
 */
export function resolveActionIconPath(manifest: ActionManifest) {
  const defaultIcon = getActionManifestEntry(manifest)?.default_icon;

  if (typeof defaultIcon === "string") {
    return defaultIcon;
  }

  return pickIconPath(defaultIcon) ?? pickIconPath(manifest.icons);
}

/** The extension URL of the page the button opens. */
export function getActionPopupUrl(extensionId: string, manifest: ActionManifest) {
  const defaultPopup = getActionManifestEntry(manifest)?.default_popup;

  if (!defaultPopup) {
    return null;
  }

  const popupUrl = URL.parse(defaultPopup, `chrome-extension://${extensionId}/`);

  // A `default_popup` that isn't a URL at all leaves the button with nothing to
  // open, which is what no popup already means. Throwing here would take the
  // whole extension down instead, since the load path catches per directory.
  if (!popupUrl) {
    return null;
  }

  // An absolute `default_popup` resolves to itself, and the popup is loaded in
  // the viewed account's session with that account's cookies, so a manifest
  // declaring one would be handed a window on the signed-in user. Chrome
  // refuses a non-relative `default_popup` when it parses the manifest; this is
  // the same refusal, one step later. `URL.origin` is no use for the
  // comparison, since it is `"null"` for every scheme the URL standard doesn't
  // call special, `chrome-extension:` among them.
  if (popupUrl.protocol !== "chrome-extension:" || popupUrl.host !== extensionId) {
    return null;
  }

  return popupUrl.href;
}

export function createExtensionAction(extension: ActionExtension): ExtensionAction {
  return {
    extensionId: extension.id,
    name: extension.name,
    title: getActionManifestEntry(extension.manifest)?.default_title ?? extension.name,
    popupUrl: getActionPopupUrl(extension.id, extension.manifest),
    iconDataUrl: null,
  };
}

/**
 * Reads the button's icon off disk as a data URL, so a renderer can draw it
 * without a protocol handler or a file path it is allowed to read from.
 */
export async function readExtensionActionIcon(extension: ActionExtension) {
  const iconPath = resolveActionIconPath(extension.manifest);

  if (!iconPath) {
    return null;
  }

  const mimeType = ICON_MIME_TYPES[path.extname(iconPath).toLowerCase()];

  if (!mimeType) {
    return null;
  }

  const extensionDir = path.resolve(extension.path);

  const iconFilePath = path.join(extensionDir, iconPath);

  // Chrome resolves an icon against the extension root and never outside it, so
  // a manifest reaching out with `..` names a file the extension never shipped
  if (!iconFilePath.startsWith(`${extensionDir}${path.sep}`)) {
    throw new Error(`Manifest declares "${iconPath}", which is outside the extension`);
  }

  const icon = await readFile(iconFilePath);

  return `data:${mimeType};base64,${icon.toString("base64")}`;
}
