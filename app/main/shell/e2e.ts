import { z } from "zod";

import type { ShellPort } from "../../core/ports.ts";
import { rectSchema } from "../../core/records/rect.ts";
import { commandIdSchema } from "../../shared/commands/registry.ts";
import type { CommandId } from "../../shared/commands/registry.ts";
import type { Stages } from "../features/stage/index.ts";

/** The global under which a run with MERU_E2E=1 leaves its inspector, which the end-to-end suite calls through Playwright's `app.evaluate`, so no page is allowed a channel only a test needs. */
export const E2E_GLOBAL = "meruE2e";

export const e2eSnapshotSchema = z.object({
  /** Every address a link sent to the browser, in order. */
  external: z.array(z.string()),
  /** The accelerator of each command in the application menu. */
  menu: z.partialRecord(commandIdSchema, z.string().nullable()),
  /** Bounds Electron reports for each child view of the first window, bottom first. */
  views: z.array(rectSchema),
  /** Each pane, in layout order: its tab, the id of the web contents showing it and its zoom factor. */
  panes: z.array(
    z.object({ contentsId: z.number(), tabId: z.string(), zoom: z.number() })
  ),
});

export type E2eSnapshot = z.infer<typeof e2eSnapshotSchema>;

/** The shell of a run under MERU_E2E: it keeps each address it was asked to open in the browser and opens none. */
export class RecordingShell implements ShellPort {
  readonly opened: string[] = [];

  readonly openExternal = (url: string) => {
    this.opened.push(url);
  };
}

/** Leaves, as a JSON string under `E2E_GLOBAL`, what Electron holds for the first window's stage and the menu, and the links sent to the browser. */
export const exposeE2e = (options: {
  readonly stages: Pick<Stages, "all">;
  readonly accelerators: () => Partial<Record<CommandId, string | null>>;
  readonly external: RecordingShell;
}): void => {
  const snapshot = (): E2eSnapshot => {
    const [stage] = options.stages.all;
    return {
      external: [...options.external.opened],
      menu: options.accelerators(),
      panes:
        stage?.panes().map(({ tab, view }) => ({
          contentsId: view.contentsId,
          tabId: tab.id,
          zoom: view.zoomFactor(),
        })) ?? [],
      views: stage?.window.childViews().map((view) => view.bounds()) ?? [],
    };
  };
  Reflect.set(globalThis, E2E_GLOBAL, () => JSON.stringify(snapshot()));
};
