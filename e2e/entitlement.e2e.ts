// Nothing in a window shows the entitlement yet, so this reads it through the
// suite's hook, from the stand-in server the suite's build holds in place of
// the entitlement API.
import type { ElectronApplication } from "@playwright/test";

import { SHELL_URL, expect, findPage, test } from "./lib/app.ts";

interface Snapshot {
  status: string;
  tier: string;
  trialDaysLeft: number | null;
  deviceName: string | null;
  hasLicenseKey: boolean;
}

const snapshot = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestEntitlement") as {
        snapshot: () => Snapshot;
      }
    ).snapshot()
  );

const activate = (app: ElectronApplication, licenseKey: string) =>
  app.evaluate(
    (_electron, key) =>
      (
        Reflect.get(globalThis, "meruTestEntitlement") as {
          activate: (key: string) => Promise<{ ok: boolean; error?: string }>;
        }
      ).activate(key),
    licenseKey
  );

test("starts a 14-day trial at the first launch and keeps a license offline", async ({
  launchApp,
}) => {
  const first = await launchApp();

  await findPage(first, SHELL_URL);
  await expect
    .poll(() => snapshot(first))
    .toMatchObject({ status: "trial", tier: "trial", trialDaysLeft: 13 });

  await expect(
    activate(first, "MERU-USED-0000-0000-0000")
  ).resolves.toMatchObject({ ok: false, error: "deviceLimit" });
  await expect(
    activate(first, "MERU-TEST-0000-0000-0000")
  ).resolves.toStrictEqual({ ok: true });
  await first.close();

  const offline = await launchApp({ MERU_STUB_OFFLINE: "1" });

  await findPage(offline, SHELL_URL);
  await expect(snapshot(offline)).resolves.toMatchObject({
    status: "licensed",
    tier: "pro",
    hasLicenseKey: true,
  });
});
