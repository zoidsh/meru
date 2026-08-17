import path from "node:path";
import { is } from "@electron-toolkit/utils";
import {
  Extensions,
  findExtensionDirs,
  getInstalledExtension,
  installLatestExtension,
  pruneDerivedExtensions,
  registerNativeMessagingScheme,
  uninstallExtension,
} from "@meru/electron-extensions";
import { curatedExtensions, isCuratedExtensionId } from "@meru/shared/extensions";
import { ms } from "@meru/shared/ms";
import type { InstalledExtensionState } from "@meru/shared/types";
import { app } from "electron";
import { serializeError } from "serialize-error";
import { config } from "@/config";
import { log } from "@/lib/log";
import { licenseKey } from "@/license-key";

/** Where the curated extensions are installed, `<installDir>/<id>/<version>`. */
const INSTALL_DIR = path.join(app.getPath("userData"), "extensions");

const DERIVED_EXTENSIONS_DIR = path.join(app.getPath("userData"), "derived-extensions");

// 1Password overrides `navigator.credentials` in the page, which is what lets a
// passkey sign-in go through in Electron and makes the passkey dialog moot
export const ONEPASSWORD_EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

/**
 * Unpacked extensions to load on top of the installed ones, one directory
 * holding a `manifest.json` per extension:
 *
 *   <repo root>/extensions/1password/manifest.json
 *
 * The folder is gitignored, and `app.getAppPath()` is the repo root in
 * development because `bun run dev` starts Electron as `electron .` there.
 */
function getDevExtensionDirs() {
  if (!is.dev) {
    return [];
  }

  return findExtensionDirs(path.join(app.getAppPath(), "extensions"));
}

/**
 * `MERU_EXTENSIONS_STRIP=content_scripts,declarative_net_request` derives every
 * extension without those manifest keys, so a run can tell which part of an
 * extension a page is reacting to. Development only, like the extensions
 * themselves.
 */
function getStrippedManifestKeys() {
  if (!is.dev) {
    return [];
  }

  return (process.env.MERU_EXTENSIONS_STRIP ?? "")
    .split(",")
    .map((manifestKey) => manifestKey.trim())
    .filter(Boolean);
}

/** The curated extensions the user opted into, and Pro is what they run on. */
function getOptedInExtensionIds() {
  if (!licenseKey.isValid) {
    return [];
  }

  return config
    .get("extensions.installed")
    .filter((extensionId) => isCuratedExtensionId(extensionId));
}

async function getInstalledExtensionDirs() {
  const extensionDirs: string[] = [];

  for (const extensionId of getOptedInExtensionIds()) {
    const installedExtension = await getInstalledExtension({
      installDir: INSTALL_DIR,
      extensionId,
    });

    if (installedExtension) {
      extensionDirs.push(installedExtension.extensionDir);
    }
  }

  return extensionDirs;
}

/**
 * Everything an account session loads: what the user opted into, plus the
 * development folder. Asked again for every session, so an account created
 * after an install gets that extension without anything being rebuilt.
 */
async function getExtensionDirs() {
  return [...getDevExtensionDirs(), ...(await getInstalledExtensionDirs())];
}

// Extension contexts reach the native messaging bridge over a custom scheme,
// and Electron only takes scheme privileges while modules are still loading
registerNativeMessagingScheme();

export const extensions = new Extensions({
  extensionDirs: getExtensionDirs,
  facadeScriptPath: path.join(__dirname, "extensions-chrome-facade.js"),
  derivedExtensionsDir: DERIVED_EXTENSIONS_DIR,
  strippedManifestKeys: getStrippedManifestKeys(),
  logger: {
    info: (message, details) => {
      log.info(message, details);
    },
    error: (message, { error, ...details }) => {
      log.error(message, { ...details, error: serializeError(error) });
    },
  },
});

/**
 * What is on disk, which config alone can't tell: an install carries a version,
 * and an opt-in that never finished installing carries nothing.
 */
export async function getInstalledExtensions() {
  const installedExtensions: InstalledExtensionState[] = [];

  for (const curatedExtension of curatedExtensions) {
    const installedExtension = await getInstalledExtension({
      installDir: INSTALL_DIR,
      extensionId: curatedExtension.id,
    });

    if (installedExtension) {
      installedExtensions.push({ id: curatedExtension.id, version: installedExtension.version });
    }
  }

  return installedExtensions;
}

/** Installs the latest version and records the opt-in, which is what loads it. */
export async function installCuratedExtension(extensionId: string) {
  const { version } = await installLatestExtension({
    extensionId,
    installDir: INSTALL_DIR,
    chromeVersion: process.versions.chrome,
  });

  const installedExtensionIds = config.get("extensions.installed");

  if (!installedExtensionIds.includes(extensionId)) {
    config.set("extensions.installed", [...installedExtensionIds, extensionId]);
  }

  log.info("Installed extension", { extensionId, version });
}

export async function uninstallCuratedExtension(extensionId: string) {
  config.set(
    "extensions.installed",
    config
      .get("extensions.installed")
      .filter((installedExtensionId) => installedExtensionId !== extensionId),
  );

  await uninstallExtension({ installDir: INSTALL_DIR, extensionId });

  log.info("Uninstalled extension", { extensionId });
}

/**
 * The copies the loader derived from extensions that are no longer loaded — an
 * extension the user opted out of, a version an update replaced — are the
 * embedder's to collect. Once per launch: every session derives from the same
 * list.
 */
export async function pruneDerivedExtensionCopies() {
  try {
    await pruneDerivedExtensions({
      derivedExtensionsDir: DERIVED_EXTENSIONS_DIR,
      keptSourceDirs: await getExtensionDirs(),
    });
  } catch (error) {
    log.error("Failed to prune derived extensions", { error: serializeError(error) });
  }
}

/**
 * Keeps the installed extensions at the version the update endpoint serves. A
 * new version is loaded on the next launch, since sessions keep the copy they
 * derived for as long as they live.
 */
class ExtensionUpdater {
  init() {
    if (!licenseKey.isValid || config.get("extensions.installed").length === 0) {
      return;
    }

    this.checkForUpdates();

    setInterval(() => {
      this.checkForUpdates();
    }, ms("3h"));
  }

  private async checkForUpdates() {
    for (const extensionId of getOptedInExtensionIds()) {
      try {
        const { updated, version } = await installLatestExtension({
          extensionId,
          installDir: INSTALL_DIR,
          chromeVersion: process.versions.chrome,
        });

        log.info(updated ? "Updated extension" : "Extension is up to date", {
          extensionId,
          version,
        });
      } catch (error) {
        log.error("Failed to update extension", { extensionId, error: serializeError(error) });
      }
    }
  }
}

export const extensionUpdater = new ExtensionUpdater();
