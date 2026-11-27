/**
 * The file the person started. Linux's AppImage and Windows' portable build
 * run from a copy they unpack, `execPath`, which does not outlive the run, and
 * name the file itself in `APPIMAGE` and `PORTABLE_EXECUTABLE_FILE`.
 */
export const startedExecutable = (
  env: Record<string, string | undefined>,
  execPath: string
) => env.APPIMAGE || env.PORTABLE_EXECUTABLE_FILE || execPath;

/**
 * What `app.relaunch` is given: the started file, and this run's arguments
 * spelled out, since Electron passes none of them once `execPath` is set.
 */
export const relaunchOptions = ({
  env,
  execPath,
  argv,
}: {
  env: Record<string, string | undefined>;
  execPath: string;
  argv: readonly string[];
}) => ({
  execPath: startedExecutable(env, execPath),
  args: argv.slice(1),
});
