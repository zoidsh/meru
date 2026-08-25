/*
 * Activates the test license key for this machine, once per run.
 *
 * Seeding the key into a config is not enough on its own. `licenseKey.validate`
 * answers DEVICE_NOT_ACTIVATED for a device the key has never been activated
 * on, and the app meets that answer before it creates any window: it shows a
 * native dialog nobody is here to dismiss, on an app with nothing to show, and
 * the run spends its whole timeout waiting for a window that never comes.
 * Measured against the production backend rather than assumed.
 *
 * Activating here rather than through the app is what keeps that off the
 * critical path. The alternative is launching without a key, driving the
 * License settings page, and restarting — three moving parts before a Pro test
 * has asserted anything, and the activation itself ends in another dialog.
 *
 * The call is idempotent and the test key has no device limit, so running it on
 * every machine and every run costs one request and changes nothing the second
 * time. It is the same call the License page makes, with the device id the app
 * itself derives: `node-machine-id` is what both compute it from.
 */
import { createMeruApiSafeClient } from "meru-api-client";
import { machineId } from "node-machine-id";

export default async function activateTestLicenseKey() {
  const licenseKey = process.env.MERU_TEST_LICENSE_KEY;

  /*
   * Absent is not an error here, because most of the suite is the free version
   * and has no use for a key. The suite that does need one fails on its own
   * when it is missing, which keeps a rotated secret loud without taking down
   * the files it has nothing to do with.
   */
  if (!licenseKey) {
    return;
  }

  // The production URL the client defaults to, which is what a built app
  // without MERU_API_URL also talks to.
  const apiClient = createMeruApiSafeClient(undefined);

  const { error } = await apiClient.v2.license.activate({
    licenseKey,
    deviceId: await machineId(),
  });

  if (error) {
    throw new Error(
      `Could not activate the test license key for this device: ${error.message}. Every Pro test would otherwise hang waiting for a window the app never shows.`,
    );
  }
}
