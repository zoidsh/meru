import { app, dialog, shell } from "electron";

import type { Platform } from "#core/platform.ts";

export type DefaultBrowserChoice = "settings" | "copy" | "cancel";

/**
 * The alert's words, already translated, and its buttons in order: the first
 * the default, the last what Escape answers.
 */
export interface DefaultBrowserAlert {
  message: string;
  detail: string;
  buttons: readonly { choice: DefaultBrowserChoice; label: string }[];
}

/** Whether the system sends web links to Meru itself, and where that is changed. */
export interface DefaultBrowser {
  isMeru: () => boolean;
  /** The system's alert, attached to no window, as the link prompt's. */
  alert: (alert: DefaultBrowserAlert) => Promise<DefaultBrowserChoice>;
  /** Where the default browser is chosen, on macOS, the one system with one such place. */
  openSettings?: () => Promise<void>;
}

// Desktop & Dock holds Default web browser from macOS 13, Meru's oldest.
const MACOS_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.Desktop-Settings.extension";

const showAlert = async ({
  message,
  detail,
  buttons,
}: DefaultBrowserAlert): Promise<DefaultBrowserChoice> => {
  const { response } = await dialog.showMessageBox({
    type: "info",
    message,
    detail,
    buttons: buttons.map(({ label }) => label),
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });

  return buttons[response]?.choice ?? "cancel";
};

/**
 * The installed Meru's. Windows never sends Meru web links, since Meru does
 * not register itself as a browser there, so it is never asked; Linux
 * answers by running xdg-settings, which Electron waits on, but only as a
 * link is about to leave.
 */
export const createDefaultBrowser = (platform: Platform): DefaultBrowser => ({
  isMeru: () => platform !== "win32" && app.isDefaultProtocolClient("https"),
  alert: showAlert,
  ...(platform === "darwin"
    ? { openSettings: () => shell.openExternal(MACOS_SETTINGS_URL) }
    : {}),
});

/** What the end-to-end build's stand-in was asked, and how it answers. */
export interface CapturedDefaultBrowser {
  isMeru: boolean;
  answer: DefaultBrowserChoice;
  asked: DefaultBrowserAlert[];
  settingsOpened: number;
}

/**
 * The end-to-end build's, which never shows an alert or a settings pane on
 * the desktop the suite shares: a test sets `isMeru` and `answer` on
 * `meruTestDefaultBrowser`, which keeps each alert asked and counts each
 * opening of the settings, offered on macOS alone as the real one's.
 */
export const createCapturedDefaultBrowser = (
  platform: Platform
): DefaultBrowser => {
  const captured: CapturedDefaultBrowser = {
    isMeru: false,
    answer: "cancel",
    asked: [],
    settingsOpened: 0,
  };

  Reflect.set(globalThis, "meruTestDefaultBrowser", captured);

  return {
    isMeru: () => captured.isMeru,
    alert: (alert) => {
      captured.asked.push(alert);

      return Promise.resolve(captured.answer);
    },
    ...(platform === "darwin"
      ? {
          openSettings: () => {
            captured.settingsOpened += 1;

            return Promise.resolve();
          },
        }
      : {}),
  };
};
