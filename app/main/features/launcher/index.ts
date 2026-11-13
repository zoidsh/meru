import { DisposableStore } from "../../../core/disposable.ts";
import type { Rect } from "../../../core/records/rect.ts";
import { err, ok } from "../../../core/result.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { launcher, launcherPushes } from "../../../shared/channels/launcher.ts";
import type { CommandRegistrar } from "../../../shared/commands/define.ts";
import type { Stages } from "../stage/index.ts";
import { launcherCommands } from "./commands.ts";

export interface LauncherOptions {
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
  readonly stages: Pick<Stages, "find">;
  /** The launcher page's address, carrying the anchor it is drawn beside. */
  readonly pageUrl: (anchor: Rect) => string;
}

/** Opens the launcher as a popup over the panes, from the chrome page's button or from launcher.open, which asks the chrome page for the button. */
export class Launcher {
  readonly #options: LauncherOptions;
  readonly #disposables = new DisposableStore();

  constructor(options: LauncherOptions) {
    this.#options = options;
  }

  start(): void {
    const { registrar, commands, stages, pageUrl } = this.#options;
    this.#disposables.add(
      commands.register(launcherCommands, {
        open: ({ windowId }) => {
          if (windowId === null) {
            return err("unknownWindow");
          }
          registrar.push(windowId, launcherPushes.requested, {});
          return ok(null);
        },
      }),
      registrar.register(launcher, {
        close: (_payload, { contentsId }) => {
          stages.find(contentsId)?.closePopup();
          return ok(undefined);
        },
        open: ({ anchor }, { contentsId }) => {
          const stage = stages.find(contentsId);
          if (stage === undefined) {
            return err("unknownWindow");
          }
          stage.openPopup(pageUrl(anchor));
          return ok(undefined);
        },
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }
}
