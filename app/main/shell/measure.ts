import type { Unsubscribe } from "../../core/ports.ts";
import { ok } from "../../core/result.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { measure } from "../../shared/channels/measure.ts";
import type { Stages } from "../features/stage/index.ts";

const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/** Names what each web contents of every stage shows, so a measurement can name the process behind it. */
export const answerMeasure = (options: {
  readonly registrar: IpcRegistrar;
  readonly stages: Pick<Stages, "all">;
}): Unsubscribe =>
  options.registrar.register(measure, {
    roles: () =>
      ok(
        options.stages.all.flatMap((stage) => [
          { contentsId: stage.window.contentsId, name: "chrome page" },
          ...stage.panes().map(({ tab, view }) => ({
            contentsId: view.contentsId,
            name: `pane ${hostOf(tab.url)}`,
          })),
          ...stage.overlays.map((overlay) => ({
            contentsId: overlay.contentsId,
            name: "overlay",
          })),
        ])
      ),
  });
