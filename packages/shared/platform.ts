/**
 * Picks the platform's own wording of a label each operating system names its
 * own way, such as the File menu, which is Apple's Ablage but Microsoft's and
 * GNOME's Datei. The three messages stay written out at the call site because
 * the Lingui macro extracts only literal calls, each with its platform as the
 * `context`.
 */
export function byPlatform<T>(
  platform: { isMacOS: boolean; isWindows: boolean },
  messages: { macOS: T; windows: T; linux: T },
): T {
  if (platform.isMacOS) {
    return messages.macOS;
  }

  return platform.isWindows ? messages.windows : messages.linux;
}
