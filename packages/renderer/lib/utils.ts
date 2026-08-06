export const platform = {
  isMacOS: window.electron.process.platform === "darwin",
  isWindows: window.electron.process.platform === "win32",
  isLinux: window.electron.process.platform === "linux",
};
