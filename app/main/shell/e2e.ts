import type { Unsubscribe } from "../../core/ports.ts";
import { err, ok } from "../../core/result.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { e2e } from "../../shared/channels/e2e.ts";
import type { CommandId } from "../../shared/commands/registry.ts";
import type { Stages } from "../features/stage/index.ts";

/** Answers the end-to-end suite's snapshot from what Electron holds for the sender's stage: the bounds of each child view, bottom first, each pane's zoom, and the menu. */
export const answerE2e = (options: {
  readonly registrar: IpcRegistrar;
  readonly stages: Pick<Stages, "find">;
  readonly accelerators: () => Partial<Record<CommandId, string | null>>;
}): Unsubscribe =>
  options.registrar.register(e2e, {
    snapshot: (_payload, { contentsId }) => {
      const stage = options.stages.find(contentsId);
      if (stage === undefined) {
        return err("unknownWindow");
      }
      return ok({
        menu: options.accelerators(),
        views: stage.window.childViews().map((view) => view.bounds()),
        zoom: stage.panes().map(({ view }) => view.zoomFactor()),
      });
    },
  });
