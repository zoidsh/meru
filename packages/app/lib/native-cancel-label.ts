import { platform } from "@electron-toolkit/utils";
import { t } from "@lingui/core/macro";
import { byPlatform } from "@meru/shared/platform";

/**
 * A native dialog's Cancel takes each operating system's word, which can
 * differ from the one on Meru's own buttons, such as Apple's imperative where
 * Microsoft and GNOME write an infinitive.
 */
export function getNativeCancelLabel() {
  // lingui-set comment="The Cancel button of a native dialog"
  return byPlatform(platform, {
    macOS: t({ message: "Cancel", context: "macOS" }),
    windows: t({ message: "Cancel", context: "Windows" }),
    linux: t({ message: "Cancel", context: "Linux" }),
  });
  // lingui-reset
}
