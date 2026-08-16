import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { Extensions, findExtensionDirs } from "@meru/electron-extensions";
import { app } from "electron";
import { serializeError } from "serialize-error";
import { log } from "@/lib/log";

/**
 * Unpacked extensions to load into every account session, one directory holding
 * a `manifest.json` per extension:
 *
 *   <repo root>/extensions/1password/manifest.json
 *
 * The folder is gitignored, and `app.getAppPath()` is the repo root in
 * development because `bun run dev` starts Electron as `electron .` there.
 *
 * Until extensions are installed from the curated list, this is the only source
 * of extensions, and it is read in development only — a packaged build has no
 * way to turn extensions on, so nothing is loaded and account sessions stay
 * exactly as they are today.
 */
function getExtensionDirs() {
  if (!is.dev) {
    return [];
  }

  return findExtensionDirs(path.join(app.getAppPath(), "extensions"));
}

export const extensions = new Extensions({
  extensionDirs: getExtensionDirs(),
  facadeScriptPath: path.join(__dirname, "extensions-chrome-facade.js"),
  derivedExtensionsDir: path.join(app.getPath("userData"), "derived-extensions"),
  logger: {
    info: (message, details) => {
      log.info(message, details);
    },
    error: (message, { error, ...details }) => {
      log.error(message, { ...details, error: serializeError(error) });
    },
  },
});
