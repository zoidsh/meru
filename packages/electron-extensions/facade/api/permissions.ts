import { coversPattern } from "../../derive/match-pattern";
import {
  type GrantedPermissionsResponse,
  PERMISSIONS_PATHS,
} from "../../permissions/bridge-protocol";
import { postBridge } from "../lib/bridge";
import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createBridgedMethod, createNoopMethod } from "../lib/method";

/** The query every method takes, as the extension wrote it. */
type PermissionsQuery = {
  permissions?: unknown;
  origins?: unknown;
};

type ExtensionManifest = {
  permissions?: unknown;
  optional_permissions?: unknown;
  host_permissions?: unknown;
};

function toStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * What Chromium granted the context this runs in, which is the manifest it
 * loaded rather than the manifest the extension was published with: the derive
 * drops the permissions Electron declares and ships no module for
 * (`derive/manifest.ts`), so `webRequest` is missing here exactly as the
 * namespace behind it is.
 */
function readManifest() {
  const runtime = (globalThis as unknown as Record<string, ChromeNamespace | undefined>).chrome
    ?.runtime as ChromeNamespace | undefined;

  const getManifest = runtime?.getManifest as (() => ExtensionManifest) | undefined;

  const manifest = getManifest?.() ?? {};

  return {
    permissions: toStrings(manifest.permissions),
    optionalPermissions: toStrings(manifest.optional_permissions),
    origins: toStrings(manifest.host_permissions),
  };
}

/**
 * The grants as the main process holds them once the call has been served
 * (`permissions/permissions.ts`), which is the one part of the answer no
 * extension context can work out for itself.
 *
 * A bridge that cannot be reached is read as no grants at all. Chrome has no
 * `lastError` on any of these methods, so there is nothing to report a failure
 * as, and the manifest's own permissions are still answered from — the same
 * trade `alarms` makes for an answer it cannot get.
 */
async function postPermissions(pathName: string, permissions: string[]) {
  try {
    const response = await postBridge(pathName, { permissions });

    if (!response.ok) {
      return [];
    }

    const granted = (await response.json()) as GrantedPermissionsResponse | null;

    return toStrings(granted?.permissions);
  } catch {
    return [];
  }
}

function containsOrigins(heldOrigins: string[], askedOrigins: string[]) {
  return askedOrigins.every((askedOrigin) =>
    heldOrigins.some((heldOrigin) => coversPattern(heldOrigin, askedOrigin)),
  );
}

/**
 * `chrome.permissions`, answered from the manifest Chromium loaded and the
 * grants the main process keeps per extension id.
 *
 * Electron ships no `permissions` module at all, so the namespace is
 * `undefined` and every call on it throws — Bitwarden's `permissionsGranted`
 * helper reads `contains` and takes whatever message it was answering down
 * with it, and Proton Pass dies at worker evaluation on `onAdded`.
 *
 * The answers are honest rather than blanket-granted, which the survey measured
 * mattering: a `contains` that answered `true` for `nativeMessaging` made
 * Bitwarden believe biometric unlock was set up and put it in a `connectNative`
 * retry loop against a desktop app that was not there. So `contains` and
 * `getAll` answer from the manifest's required permissions, which are the ones
 * Chromium really did grant, plus whatever a `request` has been allowed since;
 * and `request` answers `false` for everything else, which is Chrome's own
 * answer for a prompt the user declined and a path every extension already
 * handles.
 *
 * Nothing granted here turns a capability on: Chromium grants nothing, so an
 * optional permission belongs in a catalog entry's
 * `grantableOptionalPermissions` only where the facade serves the feature
 * behind it. It is also why no origin is ever granted — a host permission is
 * Chromium's to enforce, and one it never granted would read as held while
 * every request made under it failed.
 *
 * The namespace holds no state, every answer coming from the manifest or the
 * bridge, so the one object the facade installs into both of Electron's globals
 * can serve both.
 */
export function createPermissions(): ChromeNamespace {
  const contains = async (query: PermissionsQuery | undefined) => {
    const askedPermissions = toStrings(query?.permissions);

    const askedOrigins = toStrings(query?.origins);

    // Chrome refuses a query that names neither with a schema error, which is a
    // throw in the extension; `false` is the nearest answer that is not one
    if (askedPermissions.length === 0 && askedOrigins.length === 0) {
      return false;
    }

    const { permissions, origins } = readManifest();

    const granted =
      askedPermissions.length === 0 ? [] : await postPermissions(PERMISSIONS_PATHS.granted, []);

    return (
      askedPermissions.every(
        (permission) => permissions.includes(permission) || granted.includes(permission),
      ) && containsOrigins(origins, askedOrigins)
    );
  };

  const request = async (query: PermissionsQuery | undefined) => {
    const askedPermissions = toStrings(query?.permissions);

    const askedOrigins = toStrings(query?.origins);

    const { permissions, optionalPermissions, origins } = readManifest();

    // An origin is granted only in the sense that the manifest already holds it
    if (!containsOrigins(origins, askedOrigins)) {
      return false;
    }

    const missingPermissions = askedPermissions.filter(
      (permission) => !permissions.includes(permission),
    );

    if (missingPermissions.length === 0) {
      return askedPermissions.length > 0 || askedOrigins.length > 0;
    }

    // Chrome refuses a request for a permission the manifest never declared
    // optional, whatever the embedder allows
    if (!missingPermissions.every((permission) => optionalPermissions.includes(permission))) {
      return false;
    }

    const granted = await postPermissions(PERMISSIONS_PATHS.request, missingPermissions);

    return missingPermissions.every((permission) => granted.includes(permission));
  };

  const remove = async (query: PermissionsQuery | undefined) => {
    const askedPermissions = toStrings(query?.permissions);

    const askedOrigins = toStrings(query?.origins);

    const { permissions, origins } = readManifest();

    // Chrome refuses to remove what the manifest requires, and every origin
    // this namespace ever answers `contains` for is one of those
    if (
      askedPermissions.some((permission) => permissions.includes(permission)) ||
      askedOrigins.some((askedOrigin) =>
        origins.some((heldOrigin) => coversPattern(heldOrigin, askedOrigin)),
      )
    ) {
      return false;
    }

    if (askedPermissions.length === 0) {
      return askedOrigins.length > 0;
    }

    const granted = await postPermissions(PERMISSIONS_PATHS.remove, askedPermissions);

    return askedPermissions.every((permission) => !granted.includes(permission));
  };

  return {
    contains: createBridgedMethod(async (callArguments) =>
      contains(callArguments[0] as PermissionsQuery | undefined),
    ),

    getAll: createBridgedMethod(async () => {
      const { permissions, origins } = readManifest();

      const granted = await postPermissions(PERMISSIONS_PATHS.granted, []);

      return {
        permissions: [
          ...permissions,
          ...granted.filter((permission) => !permissions.includes(permission)),
        ],
        origins,
      };
    }),

    request: createBridgedMethod(async (callArguments) =>
      request(callArguments[0] as PermissionsQuery | undefined),
    ),

    remove: createBridgedMethod(async (callArguments) =>
      remove(callArguments[0] as PermissionsQuery | undefined),
    ),

    // Chrome's site-access flows, which have no surface here: an extension
    // asking for one is answered the way a request nobody acted on is
    addHostAccessRequest: createNoopMethod(() => undefined),
    removeHostAccessRequest: createNoopMethod(() => undefined),

    // A grant is the user's in Chrome and the catalog's here, so neither event
    // has anything to announce. They exist because an extension registers its
    // listeners at startup and dies on the dereference if they do not
    onAdded: createNoopEvent(),
    onRemoved: createNoopEvent(),
  };
}
