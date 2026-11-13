import type { GateRefusal } from "../../../core/entitlement/gate.ts";
import { msg } from "../../../shared/msg.ts";
import type { Message } from "../../../shared/msg.ts";

const REFUSALS: Readonly<Record<GateRefusal, Message>> = {
  disabled: msg`Your Meru Pro license is turned off.`,
  free: msg`Upgrade to Meru Pro to unlock this.`,
  trialEnded: msg`Your Meru Pro trial has ended. Upgrade to keep using this.`,
};

/** Why the gate refused, as the page that shows a locked Pro control says it. */
export const refusalOf = (reason: GateRefusal): Message => REFUSALS[reason];
