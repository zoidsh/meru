import type { ServerRefusal } from "#core/entitlement.ts";

/** A signed token, or why there is none. */
export type ServerAnswer = { token: string } | { error: ServerRefusal };

/** The entitlement API. Every answer that carries a token is signed by the server. */
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
});
