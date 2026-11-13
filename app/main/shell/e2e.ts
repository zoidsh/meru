import { z } from "zod";

import { rectSchema } from "../../core/records/rect.ts";
import { commandIdSchema } from "../../shared/commands/registry.ts";
import type { CommandId } from "../../shared/commands/registry.ts";
import type { Stages } from "../features/stage/index.ts";

/** The global under which a run with MERU_E2E=1 leaves its inspector, which the end-to-end suite calls through Playwright's `app.evaluate`, so no page is allowed a channel only a test needs. */
export const E2E_GLOBAL = "meruE2e";

export const e2eSnapshotSchema = z.object({
  /** The accelerator of each command in the application menu. */
  menu: z.partialRecord(commandIdSchema, z.string().nullable()),
  /** Bounds Electron reports for each child view of the first window, bottom first. */
  views: z.array(rectSchema),
  /** Each pane's tab and the id of the web contents showing it, in layout order. */
  tabs: z.array(z.object({ contentsId: z.number(), tabId: z.string() })),
  /** Each pane's zoom factor, in layout order. */
  zoom: z.array(z.number()),
});

export type E2eSnapshot = z.infer<typeof e2eSnapshotSchema>;

/** Leaves, as a JSON string under `E2E_GLOBAL`, what Electron holds for the first window's stage and the menu. */
export const exposeE2e = (options: {
  readonly stages: Pick<Stages, "all">;
  readonly accelerators: () => Partial<Record<CommandId, string | null>>;
}): void => {
  const snapshot = (): E2eSnapshot => {
    const [stage] = options.stages.all;
    return {
      menu: options.accelerators(),
      tabs:
        stage?.panes().map(({ tab, view }) => ({
          contentsId: view.contentsId,
          tabId: tab.id,
        })) ?? [],
      views: stage?.window.childViews().map((view) => view.bounds()) ?? [],
      zoom: stage?.panes().map(({ view }) => view.zoomFactor()) ?? [],
    };
  };
  Reflect.set(globalThis, E2E_GLOBAL, () => JSON.stringify(snapshot()));
};
