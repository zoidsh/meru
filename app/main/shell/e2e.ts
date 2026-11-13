import type { Unsubscribe } from "../../core/ports.ts";
import { ok } from "../../core/result.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { e2e } from "../../shared/channels/e2e.ts";
import type { CommandId } from "../../shared/commands/registry.ts";
import type { Stages } from "../features/stage/index.ts";

/** Answers the end-to-end suite's snapshot from what Electron holds for the sender's stage and the menu. */
export const answerE2e = (options: {
  readonly registrar: IpcRegistrar;
  readonly stages: Pick<Stages, "inspect">;
  readonly accelerators: () => Partial<Record<CommandId, string | null>>;
}): Unsubscribe =>
  options.registrar.register(e2e, {
    snapshot: (_payload, { contentsId }) => {
      const inspected = options.stages.inspect(contentsId);
      return inspected.ok
        ? ok({ ...inspected.value, menu: options.accelerators() })
        : inspected;
    },
  });
