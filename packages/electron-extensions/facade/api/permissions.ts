import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

/**
 * SPIKE: the one hole Electron leaves that crashes an extension outright.
 * Chromium's `permissions` module is not built into Electron, so the namespace
 * is `undefined` and every call on it is a `TypeError` — Bitwarden's
 * `permissionsGranted` helper reads `chrome.permissions.contains` and throws
 * out of whatever message it was answering, which closes the message port and
 * takes the fill path with it.
 *
 * The answers are honest rather than blanket-granted, which the earlier survey
 * found to matter: `contains` returning `true` made Bitwarden believe biometric
 * unlock was already set up and put it in a ten-second `connectNative` retry
 * loop against a desktop app that is not there. So `contains` and `getAll`
 * answer from the manifest's *required* permissions, which are the ones
 * Chromium really did grant, plus whatever a `request` has granted since.
 *
 * `request` grants only what the embedder allowed, and answers `false` for
 * everything else — Chrome's own answer for a prompt the user declined, which
 * every extension already handles.
 */
type PermissionsQuery = { permissions?: unknown; origins?: unknown };

function toStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function createPermissions(getGrantablePermissions: () => string[]): ChromeNamespace {
  /** What a `request` has granted this context, on top of the manifest's own. */
  const granted = new Set<string>();

  const getManifestPermissions = () => {
    const runtime = (globalThis as unknown as Record<string, ChromeNamespace | undefined>).chrome
      ?.runtime as ChromeNamespace | undefined;

    const getManifest = runtime?.getManifest as (() => Record<string, unknown>) | undefined;

    const manifest = getManifest?.() ?? {};

    return {
      permissions: toStrings(manifest.permissions),
      origins: toStrings(manifest.host_permissions),
    };
  };

  const contains = (query: PermissionsQuery | undefined) => {
    const { permissions, origins } = getManifestPermissions();

    const requestedPermissions = toStrings(query?.permissions);

    const requestedOrigins = toStrings(query?.origins);

    if (requestedPermissions.length === 0 && requestedOrigins.length === 0) {
      return false;
    }

    return (
      requestedPermissions.every(
        (permission) => permissions.includes(permission) || granted.has(permission),
      ) &&
      // Chrome matches an origin against the patterns the extension holds. The
      // curated extensions all declare `https://*/*` or wider, so a containment
      // check that is pattern-aware buys nothing here and a wrong `false` would
      // turn a working feature off; an embedder narrowing `host_permissions`
      // would need the real matcher
      requestedOrigins.every(() => origins.length > 0)
    );
  };

  return {
    contains: createNoopMethod((callArguments) => contains(callArguments[0] as PermissionsQuery)),

    getAll: createNoopMethod(() => {
      const { permissions, origins } = getManifestPermissions();

      return { permissions: [...permissions, ...granted], origins };
    }),

    request: createNoopMethod((callArguments) => {
      const requested = toStrings((callArguments[0] as PermissionsQuery | undefined)?.permissions);

      const grantable = getGrantablePermissions();

      if (
        requested.length === 0 ||
        !requested.every((permission) => grantable.includes(permission))
      ) {
        return false;
      }

      for (const permission of requested) {
        granted.add(permission);
      }

      return true;
    }),

    remove: createNoopMethod((callArguments) => {
      for (const permission of toStrings(
        (callArguments[0] as PermissionsQuery | undefined)?.permissions,
      )) {
        granted.delete(permission);
      }

      return true;
    }),

    // Chrome added both for the site-access flows; neither has an embedder
    // surface here, and both resolve the way a request nobody answered does
    addHostAccessRequest: createNoopMethod(() => undefined),
    removeHostAccessRequest: createNoopMethod(() => undefined),

    onAdded: createNoopEvent(),
    onRemoved: createNoopEvent(),
  };
}
