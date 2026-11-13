import { DisposableStore } from "../../../core/disposable.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { Orientation } from "../../../core/records/layout.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { launcher } from "../../../shared/channels/launcher.ts";
import type { OverlayKind } from "../../../shared/channels/surfaces.ts";
import type { CommandRegistrar } from "../../../shared/commands/define.ts";
import type { Stages } from "../stage/index.ts";
import { launcherCommands } from "./commands.ts";

export interface LauncherOptions {
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
  readonly events: AppEvents;
  readonly stages: Pick<Stages, "find">;
  /** The overlay page's address for an overlay of `kind`, carrying `query`. */
  readonly overlayUrl: (
    kind: OverlayKind,
    query: Readonly<Record<string, string>>
  ) => string;
}

/** Opens the launcher as an overlay over the panes of a window: from the chrome page's button, from launcher.open, and for the app of a new pane on split.requested. */
export class Launcher {
  readonly #options: LauncherOptions;
  readonly #disposables = new DisposableStore();

  constructor(options: LauncherOptions) {
    this.#options = options;
  }

  start(): void {
    const { registrar, commands, events, stages } = this.#options;
    this.#disposables.add(
      commands.register(launcherCommands, {
        open: ({ windowId }) =>
          windowId === null ? err("unknownWindow") : this.open(windowId),
      }),
      events.on("split.requested", ({ windowId, orientation }) => {
        this.open(windowId, orientation);
      }),
      registrar.register(launcher, {
        close: (_payload, { contentsId }) => {
          stages.find(contentsId)?.closeOverlay();
          return ok(undefined);
        },
        open: ({ split }, { contentsId }) => this.open(contentsId, split),
      })
    );
  }

  /** Opens the launcher over the panes of the window whose chrome page is `windowId`, its pick splitting the focused pane in `split` when given. */
  open(
    windowId: number,
    split?: Orientation
  ): Result<undefined, "unknownWindow"> {
    const { stages, overlayUrl } = this.#options;
    const stage = stages.find(windowId);
    if (stage === undefined) {
      return err("unknownWindow");
    }
    stage.openOverlay(
      "launcher",
      overlayUrl("launcher", split === undefined ? {} : { split })
    );
    return ok(undefined);
  }

  dispose(): void {
    this.#disposables.dispose();
  }
}
