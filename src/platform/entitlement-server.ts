import type { ServerRefusal } from "#core/entitlement.ts";

/** A signed token, or why there is none. */
export type ServerAnswer = { token: string } | { error: ServerRefusal };

/** Whether the server freed this device's place on its license. */
export type DeactivationAnswer =
  | { deactivated: true }
  | { error: ServerRefusal };

/**
 * The entitlement API. Every answer that carries a token is signed by the
 * server. A call may reject, as a request over the network does; the service
 * reads that as no answer, so an adapter need not catch. A thrown error's
 * message never carries the license key, a token or the device id, so a
 * request puts none of them in its URL: the service logs the error's name
 * and message. Every call settles within a bound of the adapter's own, a
 * timeout that rejects: Settings sends one license request at a time, so a
 * call that never settled would hold every other until Meru restarts.
 */
export interface EntitlementServer {
  /** A trial sends the device's id alone; a license, its key too. */
  refresh: (request: {
    deviceId: string;
    licenseKey?: string;
  }) => Promise<ServerAnswer>;
  /**
   * Sends nothing of the machine but its id: the server names the device
   * itself, and only a name the person types ever leaves the machine.
   */
  activate: (request: {
    deviceId: string;
    licenseKey: string;
  }) => Promise<ServerAnswer>;
  /** An empty `deviceLabel` gives the device back the name the server chose. */
  setDeviceLabel: (request: {
    deviceId: string;
    licenseKey: string;
    deviceLabel: string;
  }) => Promise<ServerAnswer>;
  /** Frees this device's place on the license, as a reset asks. */
  deactivate: (request: {
    deviceId: string;
    licenseKey: string;
  }) => Promise<DeactivationAnswer>;
}

/**
 * A release's server until the entitlement API exists: it answers nothing, so
 * a release holds no token and gates nothing.
 */
const unanswered = () => Promise.resolve({ error: "offline" } as const);

export const createUnreachableEntitlementServer = (): EntitlementServer => ({
  refresh: unanswered,
  activate: unanswered,
  setDeviceLabel: unanswered,
  deactivate: unanswered,
});
