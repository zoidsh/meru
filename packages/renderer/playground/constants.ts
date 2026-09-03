export const playgroundPlatforms = {
  linux: "Linux",
  darwin: "macOS",
  win32: "Windows",
} as const;

export type PlaygroundPlatform = keyof typeof playgroundPlatforms;

function isPlaygroundPlatform(value: string | null): value is PlaygroundPlatform {
  return value !== null && value in playgroundPlatforms;
}

/**
 * The renderer's `platform` helper and the titlebar both read
 * `process.platform` once as their module evaluates, so the platform travels in
 * the URL and the preview reloads to change it.
 */
export function getPlaygroundPlatform(searchParams: URLSearchParams): PlaygroundPlatform {
  const platform = searchParams.get("platform");

  return isPlaygroundPlatform(platform) ? platform : "linux";
}

/** The account every scenario's fixtures belong to. */
export const PLAYGROUND_ACCOUNT_ID = "playground-account";

/** Names the preview reads out of its own URL, and the shell writes into it. */
export const PLAYGROUND_SEARCH_PARAMS = {
  scenario: "scenario",
  platform: "platform",
  darkMode: "darkMode",
} as const;
