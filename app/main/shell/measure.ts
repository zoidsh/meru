import type { Unsubscribe } from "../../core/ports.ts";
import { ok } from "../../core/result.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { measure } from "../../shared/channels/measure.ts";
import type { Stages } from "../features/stage/index.ts";

/** Names what each web contents shows, so a measurement can name the process behind it. */
export const answerMeasure = (options: {
  readonly registrar: IpcRegistrar;
  readonly stages: Pick<Stages, "roles">;
}): Unsubscribe =>
  options.registrar.register(measure, {
    roles: () => ok(options.stages.roles()),
  });
