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
  /**
   * The URL or origin of the page the frame is in, which alone is judged for
   * `fullscreen`, when Electron says.
   */
  topLevelUrl?: string;
  /** For `media`, what it asks for, when Electron says. */
  mediaTypes?: readonly string[];
}

const originOf = (url: string) => URL.parse(url)?.origin;

/**
 * Whether a page may have a permission: only a frame on an origin an app
 * claims, and only what that app needs, so a third-party frame inside an app,
 * an `about:blank` frame, or a page no app claims, gets nothing. Fullscreen
 * is judged by the page instead, so a video another site embeds in an app
 * can fill the screen; a frame can ask for it only if its parent let it.
 */
export const allowsPermission = (
  apps: readonly App[],
  { permission, requestingUrl, topLevelUrl, mediaTypes }: PermissionAsk
): boolean => {
  const origin = originOf(
    permission === "fullscreen" ? (topLevelUrl ?? requestingUrl) : requestingUrl
  );
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
