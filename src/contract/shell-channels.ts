// Apart from the schemas in shell.ts, so the shell's preload, which needs only
// these names, carries no zod.

import { contractChannels } from "./channels.ts";
import { SHELL_ENTITLEMENT_CALL_NAMES } from "./entitlement-channels.ts";

export const SHELL_CALL_NAMES = [
  "selectProfile",
  "selectTab",
  "closeTab",
  "moveTab",
  "moveInBox",
  "splitOntoTab",
  "aimTab",
  "dropTab",
  "resizePanes",
  "evenOutPanes",
  "maximizePane",
  "retryTab",
  "closeOverlay",
  "runUpdateCard",
  "findInPage",
  "findStep",
  "closeFind",
  "toggleSidebar",
  "navigate",
  "navigateTab",
  "toggleSidebarWidth",
  "toggleDoNotDisturb",
  "openDoNotDisturbMenu",
  "setInboxOpen",
  "openInboxMessage",
  "runInboxAction",
  "setDownloadsOpen",
  "openDownload",
  "showDownload",
  "dragDownload",
  "cancelDownload",
  "removeDownload",
  "clearDownloads",
  "shareScreen",
  "answerProfileQuestion",
  "cancelScreenPicker",
  "retryScreenPicker",
  "openScreenRecordingSettings",
  "toggleOpenApp",
  "openBookmark",
  "removeBookmark",
  "toggleTabBookmark",
  "openApp",
  "openGmail",
  "openTabMenu",
  "openOwnWindowMenu",
  "openProfileMenu",
  ...SHELL_ENTITLEMENT_CALL_NAMES,
] as const;

/** What the titlebar's navigation buttons ask of the front tab. */
export const NAVIGATE_ACTIONS = ["back", "forward", "reload", "stop"] as const;

export type ShellCallName = (typeof SHELL_CALL_NAMES)[number];

export const SHELL_CHANNELS = {
  ...contractChannels<ShellCallName>("shell"),
  /** Main to renderer: a `SoundRequest` to play now. */
  sound: "shell:sound",
} as const;
