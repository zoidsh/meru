import { z } from "zod";

import type { Stages } from "../features/stage/index.ts";

/** The global under which a run with MERU_MEASURE=1 leaves the names of its web contents, which `pnpm measure` reads through Playwright's `app.evaluate`. */
export const MEASURE_GLOBAL = "meruMeasure";

/** What each web contents shows, by its id: the chrome page, a tab's view by its host, marked detached while no pane shows it, an overlay. */
export const measureRolesSchema = z.array(
  z.object({ contentsId: z.number().int(), name: z.string() })
);

const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/** Leaves, as a JSON string under `MEASURE_GLOBAL`, what each web contents of every stage shows, so a measurement can name the process behind it. */
export const exposeMeasure = (options: {
  readonly stages: Pick<Stages, "all">;
}): void => {
  const roles = (): z.infer<typeof measureRolesSchema> =>
    options.stages.all.flatMap((stage) => [
      { contentsId: stage.window.contentsId, name: "chrome page" },
      ...stage.kept().map(({ tab, view, shown }) => ({
        contentsId: view.contentsId,
        name: `pane ${hostOf(tab.url)}${shown ? "" : " (detached)"}`,
      })),
      ...stage.overlays.map((overlay) => ({
        contentsId: overlay.contentsId,
        name: "overlay",
      })),
    ]);
  Reflect.set(globalThis, MEASURE_GLOBAL, () => JSON.stringify(roles()));
};
