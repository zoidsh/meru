import type { Unsubscribe } from "../../core/ports.ts";
import type { Entitlement } from "../../core/records/entitlement.ts";
import type { UpdateState } from "../../core/records/update.ts";
import { ok } from "../../core/result.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { e2e } from "../../shared/channels/e2e.ts";
import type { ProfilesSnapshot } from "../../shared/channels/profiles.ts";
import type { Stages } from "../features/stage/index.ts";

/** Answers the end-to-end suite's snapshot from the sender's stage, the menu as Electron holds it, the entitlement, the profiles and the update state. */
export const answerE2e = (options: {
  readonly registrar: IpcRegistrar;
  readonly stages: Pick<Stages, "inspect">;
  readonly accelerators: () => Record<string, string | null>;
  readonly entitlement: { readonly current: () => Entitlement };
  readonly profiles: { readonly snapshot: () => ProfilesSnapshot };
  readonly updater: { readonly current: () => UpdateState };
}): Unsubscribe =>
  options.registrar.register(e2e, {
    snapshot: (_payload, { contentsId }) => {
      const inspected = options.stages.inspect(contentsId);
      return inspected.ok
        ? ok({
            ...inspected.value,
            entitlement: options.entitlement.current(),
            menu: options.accelerators(),
            profiles: options.profiles.snapshot(),
            update: options.updater.current(),
          })
        : inspected;
    },
  });
