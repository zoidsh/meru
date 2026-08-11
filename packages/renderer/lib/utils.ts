/**
 * Fades a control in when it takes over a host and out when it hands over,
 * without either host having to keep it mounted: `transition-discrete` holds
 * the `display` flip until the fade has played, and `starting:` supplies the
 * transparent state it fades in from.
 */
export const HOST_HANDOVER_FADE_CLASS_NAME =
  "transition-[opacity,display] transition-discrete duration-150 starting:opacity-0";

export const platform = {
  isMacOS: window.electron.process.platform === "darwin",
  isWindows: window.electron.process.platform === "win32",
  isLinux: window.electron.process.platform === "linux",
};
