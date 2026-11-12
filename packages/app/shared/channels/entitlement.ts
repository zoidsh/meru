import { z } from "zod";

import { entitlementSchema } from "../../core/records/entitlement.ts";
import { defineChannels, definePushes, push, sync } from "./define.ts";

export const entitlement = defineChannels("entitlement", {
  snapshot: sync(z.object({}), entitlementSchema),
});

export const entitlementPushes = definePushes("entitlement", {
  changed: push(entitlementSchema),
});
