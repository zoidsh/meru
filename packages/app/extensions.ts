import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { Extensions } from "@meru/electron-extensions";
import { serializeError } from "serialize-error";
import { log } from "@/lib/log";

/**
 * Unpacked extension directories to load into every account session, separated
 * by the platform's path delimiter:
 *
 *   MERU_EXTENSIONS_DIRS=/path/to/1password bun run dev
 *
 * Until extensions are installed from the curated list, this is the only source
 * of extensions, and it is read in development only — a packaged build has no
 * way to turn extensions on, so nothing is loaded and account sessions stay
 * exactly as they are today.
 */
const EXTENSION_DIRS_ENV_VAR = "MERU_EXTENSIONS_DIRS";

function getExtensionDirs() {
  const extensionDirs = is.dev ? process.env[EXTENSION_DIRS_ENV_VAR] : undefined;

  if (!extensionDirs) {
    return [];
  }

  return extensionDirs
    .split(path.delimiter)
    .filter(Boolean)
    .map((extensionDir) => path.resolve(extensionDir));
}

export const extensions = new Extensions({
  extensionDirs: getExtensionDirs(),
  logger: {
    info: (message, details) => {
      log.info(message, details);
    },
    error: (message, { error, ...details }) => {
      log.error(message, { ...details, error: serializeError(error) });
    },
  },
});
