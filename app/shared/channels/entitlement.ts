import { entitlementSchema } from "../../core/records/entitlement.ts";
import {
  defineChannels,
  definePushes,
  noPayload,
  push,
  sync,
} from "./define.ts";

export const entitlement = defineChannels("entitlement", {
  snapshot: sync(noPayload, entitlementSchema),
});

export const entitlementPushes = definePushes("entitlement", {
  changed: push(entitlementSchema),
});
