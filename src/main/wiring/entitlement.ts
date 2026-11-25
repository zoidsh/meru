import path from "node:path";

import type { EntitlementFile } from "#core/entitlement-file.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import { readDeviceId } from "#platform/device-id.ts";
import { createUnreachableEntitlementServer } from "#platform/entitlement-server.ts";
import { createTextFile } from "#platform/text-file.ts";
import type { TextFile } from "#platform/text-file.ts";

import {
  DEV_PUBLIC_KEY,
  createStubEntitlementServer,
} from "../entitlement-stub.ts";
import { publicKeyFromRaw } from "../entitlement-token.ts";
import { createEntitlement, saveEntitlementFile } from "../entitlement.ts";
import { exposeEntitlementToSuite } from "./test-build.ts";

/**
 * The server and the key its tokens verify with. Development and the suite
 * get the stand-in; a release, until the entitlement API exists, a server
 * that never answers and no key, so it holds no token and gates nothing.
 */
const entitlementSource = (userDataPath: string) => {
  if (MERU_BUILD_MODE === "dev" || MERU_E2E_BUILD) {
    return {
      server: createStubEntitlementServer({
        file: createTextFile(path.join(userDataPath, "entitlement-stub.json")),
        now: Date.now,
        offline: () => process.env.MERU_STUB_OFFLINE === "1",
      }),
      publicKey: publicKeyFromRaw(DEV_PUBLIC_KEY),
    };
  }

  return { server: createUnreachableEntitlementServer(), publicKey: undefined };
};

/**
 * The entitlement, read from its store with no network and refreshed in the
 * background from here on. Nothing asks it yet.
 */
export const wireEntitlement = async ({
  lifecycle,
  file,
  initial,
}: {
  lifecycle: ReturnType<typeof createAppLifecycle>;
  file: TextFile;
  initial: EntitlementFile;
}) => {
  // A device whose id cannot be read verifies no token and asks nothing.
  const deviceId = await readDeviceId().catch((error: unknown) => {
    console.error(`Could not read this device's id: ${String(error)}`);

    return "";
  });
  const entitlement = createEntitlement({
    initial,
    save: (next) => saveEntitlementFile(file, next),
    ...entitlementSource(lifecycle.userDataPath),
    deviceId,
    now: Date.now,
    log: console.error,
  });

  void entitlement.start();

  lifecycle.onBeforeQuit(entitlement.dispose);

  exposeEntitlementToSuite(entitlement);

  return { entitlement };
};
