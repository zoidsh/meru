import { platform } from "@electron-toolkit/utils";
import { t } from "@lingui/core/macro";
import { byPlatform } from "@meru/shared/platform";

/**
 * A native dialog's Quit takes each operating system's word, since in some
 * languages the plain word for quitting is the one for closing a window.
 */
export function getNativeQuitLabel() {
  // lingui-set comment="Dialog button that quits Meru"
  return byPlatform(platform, {
    macOS: t({ message: "Quit", context: "macOS" }),
    windows: t({ message: "Quit", context: "Windows" }),
    linux: t({ message: "Quit", context: "Linux" }),
  });
  // lingui-reset
}
