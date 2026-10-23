import { platform } from "@electron-toolkit/utils";

// Chrome's reduced user agent freezes the platform token, so these are what
// Chrome itself sends on any version of each system and on any architecture.
const MACOS_PLATFORM_TOKEN = "Macintosh; Intel Mac OS X 10_15_7";
const WINDOWS_PLATFORM_TOKEN = "Windows NT 10.0; Win64; x64";
const LINUX_PLATFORM_TOKEN = "X11; Linux x86_64";

function getPlatformToken() {
  if (platform.isMacOS) {
    return MACOS_PLATFORM_TOKEN;
  }

  if (platform.isWindows) {
    return WINDOWS_PLATFORM_TOKEN;
  }

  return LINUX_PLATFORM_TOKEN;
}

/** The reduced user agent also freezes every part of the version but the major. */
export function getChromeUserAgent(chromeVersion: string) {
  const [majorVersion] = chromeVersion.split(".");

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- a user agent, which websites read the same in every language
  return `Mozilla/5.0 (${getPlatformToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`;
}
