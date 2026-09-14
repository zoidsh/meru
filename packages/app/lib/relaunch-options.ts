import type { RelaunchOptions } from "electron";

type Platform = { isLinux: boolean; isWindows: boolean };

/**
 * Both the AppImage and the Windows portable build run Meru from a temporary
 * mount or extraction that their launcher removes once the process exits, so
 * `process.execPath` is gone by the time the relauncher execs it. The launcher
 * exports the path of the file the user ran, which survives the restart.
 */
export function getRelaunchOptions(
  { isLinux, isWindows }: Platform,
  env: NodeJS.ProcessEnv,
  argv: string[],
): RelaunchOptions | undefined {
  const execPath = isLinux ? env.APPIMAGE : isWindows ? env.PORTABLE_EXECUTABLE_FILE : undefined;

  if (!execPath) {
    return;
  }

  return { execPath, args: argv.slice(1) };
}
