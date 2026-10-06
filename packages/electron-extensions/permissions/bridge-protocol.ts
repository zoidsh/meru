/**
 * What `chrome.permissions` says over the extension bridge (`bridge/protocol.ts`),
 * shared by the facade and the main process.
 *
 * Only the grants travel. What the extension already holds is in the manifest
 * Chromium loaded, which the facade reads in the context asking
 * (`facade/api/permissions.ts`), so the main process answers the one question
 * no context can answer for itself: what a `request` has granted this
 * extension, here or in a launch before this one.
 *
 * Every route answers the same shape — the grants as they stand once the call
 * has been served — so a request the catalog refuses and a request it allows
 * are told apart by what came back rather than by a second boolean that could
 * disagree with it.
 */

export const PERMISSIONS_PATHS = {
  granted: "/permissions/granted",
  request: "/permissions/request",
  remove: "/permissions/remove",
} as const;

/** What the extension named in a `request` or a `remove`, taken as untrusted. */
export type PermissionsChangeRequest = {
  permissions: unknown;
};

/** The extension's granted optional permissions, after the call. */
export type GrantedPermissionsResponse = {
  permissions: string[];
};
