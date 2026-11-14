import { entitlementSchema } from "../../core/records/entitlement.ts";
import { defineChannels, noPayload, sync } from "./define.ts";

export const entitlement = defineChannels("entitlement", {
  snapshot: sync(noPayload, entitlementSchema),
});
