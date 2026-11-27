import { formatAccelerator } from "./accelerator.ts";
import type { Platform } from "./platform.ts";

/** A key a Google app uses, on macOS or on Windows and Linux, Google's PC column. */
export interface GoogleAppKey {
  accelerator: string;
  on: "mac" | "pc";
  apps: readonly string[];
}

const digits = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * Meru's former defaults that Google's published shortcut lists take, as
 * the audit of 18 November 2026 found them, which the keymap of 26 November
 * moved off. Not yet Google's full lists.
 */
export const GOOGLE_APP_KEYS: readonly GoogleAppKey[] = [
  { accelerator: "Command+R", on: "mac", apps: ["Sheets"] },
  { accelerator: "Control+R", on: "pc", apps: ["Sheets"] },
  ...["Command+[", "Command+]"].map((accelerator): GoogleAppKey => ({
    accelerator,
    on: "mac",
    apps: ["Gmail", "Docs", "Slides", "Keep", "Tasks"],
  })),
  ...["Alt+Left", "Alt+Right"].map((accelerator): GoogleAppKey => ({
    accelerator,
    on: "pc",
    apps: ["Docs", "Slides"],
  })),
  ...digits(2, 5).map((digit): GoogleAppKey => ({
    accelerator: `Command+${digit}`,
    on: "mac",
    apps: ["Sheets"],
  })),
  ...digits(1, 9).map((digit): GoogleAppKey => ({
    accelerator: `Alt+${digit}`,
    on: "pc",
    apps: digit === 1 ? ["Sheets", "Chat"] : ["Chat"],
  })),
  { accelerator: "Command+Shift+,", on: "mac", apps: ["Docs", "Slides"] },
  { accelerator: "Control+Shift+,", on: "pc", apps: ["Docs", "Slides"] },
  { accelerator: "Command+Shift+S", on: "mac", apps: ["Docs", "Drive"] },
  { accelerator: "Control+Shift+S", on: "pc", apps: ["Docs", "Drive"] },
  { accelerator: "Control+Alt+N", on: "pc", apps: ["Docs"] },
  { accelerator: "Control+Alt+Shift+N", on: "pc", apps: ["Docs", "Sheets"] },
  { accelerator: "Command+Shift+Enter", on: "mac", apps: ["Sheets", "Slides"] },
  { accelerator: "Control+Shift+Enter", on: "pc", apps: ["Sheets"] },
  ...digits(1, 7).map((digit): GoogleAppKey => ({
    accelerator: `Control+Shift+${digit}`,
    on: "mac",
    apps: ["Sheets"],
  })),
  ...digits(1, 9).map((digit): GoogleAppKey => ({
    accelerator: `Control+Shift+${digit}`,
    on: "pc",
    apps: ["Sheets", "Docs", "Slides", "Gmail", "Keep"],
  })),
  { accelerator: "Command+D", on: "mac", apps: ["Sheets", "Slides", "Meet"] },
  { accelerator: "Control+D", on: "pc", apps: ["Sheets", "Slides", "Meet"] },
  { accelerator: "Command+Shift+J", on: "mac", apps: ["Docs", "Slides"] },
  { accelerator: "Control+J", on: "pc", apps: ["Chat"] },
  ...(["mac", "pc"] as const).flatMap((on): GoogleAppKey[] => [
    {
      accelerator: "CommandOrControl+F",
      on,
      apps: ["Docs", "Sheets", "Slides", "Drive"],
    },
    // Kept by Meru for the same action, zooming and full screen.
    { accelerator: "CommandOrControl+Plus", on, apps: ["Docs", "Slides"] },
    { accelerator: "CommandOrControl+-", on, apps: ["Docs", "Slides"] },
    { accelerator: "CommandOrControl+0", on, apps: ["Docs", "Slides"] },
  ]),
  { accelerator: "Control+Command+F", on: "mac", apps: ["Slides"] },
  { accelerator: "F11", on: "pc", apps: ["Slides"] },
  // Ctrl+M, which the keymap decision keeps as Minimize, is not listed: the
  // audit recorded no app on it. Neither it nor macOS's Command+M is yet
  // checked against Slides' list.
];

/** The Google apps that use `accelerator` on `platform`, as the list has them. */
export const googleAppsUsing = (accelerator: string, platform: Platform) => {
  const on = platform === "darwin" ? "mac" : "pc";
  const shown = formatAccelerator(accelerator, platform);

  return GOOGLE_APP_KEYS.filter(
    (entry) =>
      entry.on === on &&
      formatAccelerator(entry.accelerator, platform) === shown
  ).flatMap((entry) => entry.apps);
};
