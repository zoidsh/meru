import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "electron";
import type { ExtensionBridge, ExtensionBridgeHandler } from "../bridge/bridge";
import { type GrantedPermissionsResponse, PERMISSIONS_PATHS } from "./bridge-protocol";
import { Permissions } from "./permissions";

const BITWARDEN_ID = "nngceckbapebfimnlniiiahkandclblb";

const ONEPASSWORD_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

let storeDir: string;

let storePath: string;

beforeEach(async () => {
  storeDir = await mkdtemp(path.join(tmpdir(), "meru-permissions-"));

  storePath = path.join(storeDir, "extension-permissions.json");
});

afterEach(async () => {
  await rm(storeDir, { recursive: true, force: true });
});

function createPermissions(
  grantable: Record<string, string[]> = { [BITWARDEN_ID]: ["nativeMessaging"] },
) {
  return new Permissions({
    storePath,
    getGrantableOptionalPermissions: (extensionId) => grantable[extensionId],
  });
}

function readStore() {
  return readFile(storePath, "utf8").then(
    (source) => JSON.parse(source) as Record<string, string[]>,
  );
}

describe("Permissions", () => {
  test("grants a permission the embedder allows that extension", async () => {
    const permissions = createPermissions();

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging"]);

    expect(await permissions.getGranted(BITWARDEN_ID)).toEqual(["nativeMessaging"]);
  });

  test("grants nothing the embedder did not allow", async () => {
    const permissions = createPermissions();

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging", "bookmarks"]);

    expect(await permissions.getGranted(BITWARDEN_ID)).toEqual(["nativeMessaging"]);
  });

  test("grants nothing to an extension the embedder allows nothing for", async () => {
    const permissions = createPermissions();

    await permissions.grant(ONEPASSWORD_ID, ["nativeMessaging"]);

    expect(await permissions.getGranted(ONEPASSWORD_ID)).toEqual([]);
  });

  test("keeps one extension's grant out of another's answer", async () => {
    const permissions = createPermissions({
      [BITWARDEN_ID]: ["nativeMessaging"],
      [ONEPASSWORD_ID]: ["nativeMessaging"],
    });

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging"]);

    expect(await permissions.getGranted(ONEPASSWORD_ID)).toEqual([]);
  });

  test("revokes a granted permission", async () => {
    const permissions = createPermissions();

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging"]);

    await permissions.revoke(BITWARDEN_ID, ["nativeMessaging"]);

    expect(await permissions.getGranted(BITWARDEN_ID)).toEqual([]);
  });

  test("answers a grant made in a launch before this one", async () => {
    await createPermissions().grant(BITWARDEN_ID, ["nativeMessaging"]);

    expect(await createPermissions().getGranted(BITWARDEN_ID)).toEqual(["nativeMessaging"]);
  });

  test("keeps no store for an extension whose last grant was revoked", async () => {
    const permissions = createPermissions();

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging"]);

    await permissions.revoke(BITWARDEN_ID, ["nativeMessaging"]);

    expect(await readStore()).toEqual({});
  });

  test("drops an extension's grants when it is uninstalled", async () => {
    const permissions = createPermissions();

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging"]);

    await permissions.clear(BITWARDEN_ID);

    expect(await permissions.getGranted(BITWARDEN_ID)).toEqual([]);

    expect(await createPermissions().getGranted(BITWARDEN_ID)).toEqual([]);
  });

  /*
   * The store is only ever what an embedder allowed, so a file carrying
   * anything else was not written by this code. It is read as a grant of
   * nothing rather than trusted, since `getGranted` is what `contains`
   * answers from.
   */
  test("reads a store that holds something other than permission lists as empty", async () => {
    await writeFile(storePath, JSON.stringify({ [BITWARDEN_ID]: { nativeMessaging: true } }));

    expect(await createPermissions().getGranted(BITWARDEN_ID)).toEqual([]);
  });

  test("starts from no grants when the store will not parse", async () => {
    await writeFile(storePath, "{");

    const permissions = createPermissions();

    expect(await permissions.getGranted(BITWARDEN_ID)).toEqual([]);

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging"]);

    expect(await readStore()).toEqual({ [BITWARDEN_ID]: ["nativeMessaging"] });
  });

  test("keeps a grant for the launch when there is nowhere to store it", async () => {
    const permissions = new Permissions({
      getGrantableOptionalPermissions: () => ["nativeMessaging"],
    });

    await permissions.grant(BITWARDEN_ID, ["nativeMessaging"]);

    expect(await permissions.getGranted(BITWARDEN_ID)).toEqual(["nativeMessaging"]);
  });
});

/**
 * The bridge's end of it, which is the shape the facade reads: every route
 * answers the grants as they stand, so a request the embedder refused is told
 * from one it allowed by what came back.
 */
describe("Permissions routes", () => {
  function registerRoutes(permissions: Permissions) {
    const routes = new Map<string, ExtensionBridgeHandler>();

    permissions.registerRoutes({
      handle: (pathname, handler) => {
        routes.set(pathname, handler);
      },
    } as ExtensionBridge);

    return async (pathname: string, permissionNames: string[]) => {
      const handler = routes.get(pathname) as ExtensionBridgeHandler;

      const response = await handler({
        session: undefined as unknown as Session,
        extensionId: BITWARDEN_ID,
        senderFrame: undefined,
        body: { permissions: permissionNames },
        headers: {},
      });

      return (await response.json()) as GrantedPermissionsResponse;
    };
  }

  test("answers the grants a request added", async () => {
    const call = registerRoutes(createPermissions());

    expect(await call(PERMISSIONS_PATHS.granted, [])).toEqual({ permissions: [] });

    expect(await call(PERMISSIONS_PATHS.request, ["nativeMessaging"])).toEqual({
      permissions: ["nativeMessaging"],
    });

    expect(await call(PERMISSIONS_PATHS.granted, [])).toEqual({
      permissions: ["nativeMessaging"],
    });
  });

  test("answers the grants unchanged for a request the embedder refuses", async () => {
    const call = registerRoutes(createPermissions());

    expect(await call(PERMISSIONS_PATHS.request, ["bookmarks"])).toEqual({ permissions: [] });
  });

  test("answers the grants a remove took away", async () => {
    const call = registerRoutes(createPermissions());

    await call(PERMISSIONS_PATHS.request, ["nativeMessaging"]);

    expect(await call(PERMISSIONS_PATHS.remove, ["nativeMessaging"])).toEqual({ permissions: [] });
  });
});
