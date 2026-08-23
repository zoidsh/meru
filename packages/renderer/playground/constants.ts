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

/**
 * Storybook packs every toolbar global into one search parameter, as
 * `platform:darwin;darkMode:!true`. Expanding it leaves the rest of the
 * playground reading plain parameters rather than knowing that shape.
 */
export function readPlaygroundSearchParams(search: string): URLSearchParams {
  const searchParams = new URLSearchParams(search);

  const globals = searchParams.get("globals");

  if (globals) {
    for (const entry of globals.split(";")) {
      const [name, value] = entry.split(":");

      if (name && value) {
        searchParams.set(name, value.replace(/^!/, ""));
      }
    }
  }

  return searchParams;
}
