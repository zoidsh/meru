import type { ENTITLEMENT_CALLS } from "#contract/entitlement.ts";
import { MERU_PRO_URL } from "#core/entitlement.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { ContractHandlers } from "./contract-ipc.ts";
import type { Entitlement } from "./entitlement.ts";
import type { LicenseRequests } from "./license-requests.ts";

export interface EntitlementHandlerDeps {
  entitlement: Pick<
    Entitlement,
    "activate" | "setDeviceName" | "retry" | "copyLicenseKey" | "continueFree"
  >;
  /** The one license request out, which every window that sends one shares. */
  licenseRequests: Pick<LicenseRequests, "run">;
  /** Meru's own links' browser, which holds a link while Meru is the default. */
  systemBrowser: Pick<SystemBrowser, "open">;
}

/**
 * The calls about Meru Pro, the same from every window that offers them:
 * each that asks the server waits its turn behind the one request out.
 */
export const entitlementHandlers = ({
  entitlement,
  licenseRequests,
  systemBrowser,
}: EntitlementHandlerDeps): ContractHandlers<typeof ENTITLEMENT_CALLS> => ({
  activateLicense: ({ licenseKey }) =>
    licenseRequests.run(() => entitlement.activate(licenseKey)),
  setDeviceName: ({ name }) =>
    licenseRequests.run(() => entitlement.setDeviceName(name)),
  retryEntitlement: () => licenseRequests.run(entitlement.retry),
  copyLicenseKey: () => entitlement.copyLicenseKey(),
  continueFree: () => entitlement.continueFree(),
  openMeruPro: () => systemBrowser.open(MERU_PRO_URL),
});
