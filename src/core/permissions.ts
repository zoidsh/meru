import type { App } from "./apps.ts";

/** What every app's own pages get, by Electron's names. */
const BASE: ReadonlySet<string> = new Set([
  "fullscreen",
  "clipboard-sanitized-write",
]);

/** The media `media` may carry; anything else riding on it is refused. */
const MEDIA_TYPES: ReadonlySet<string> = new Set(["audio", "video"]);

export interface PermissionAsk {
  permission: string;
  /** The URL or origin of the frame asking, never of the page embedding it. */
  requestingUrl: string;
  /** For `media`, what it asks for, when Electron says. */
  mediaTypes?: readonly string[];
}

const originOf = (url: string) =>
  URL.canParse(url) ? new URL(url).origin : undefined;

/**
 * Whether a page may have a permission: only a frame on an origin an app
 * claims, and only what that app needs, so a third-party frame inside an app,
 * or a page no app claims, gets nothing.
 */
export const allowsPermission = (
  apps: readonly App[],
  { permission, requestingUrl, mediaTypes }: PermissionAsk
): boolean => {
  const origin = originOf(requestingUrl);
  const claiming = apps.filter((app) =>
    app.claims.some((claim) => claim.origin === origin)
  );

  if (origin === undefined || claiming.length === 0) {
    return false;
  }

  if (
    permission === "media" &&
    mediaTypes?.some((type) => !MEDIA_TYPES.has(type))
  ) {
    return false;
  }

  return (
    BASE.has(permission) ||
    claiming.some((app) => app.permissions.includes(permission))
  );
};
