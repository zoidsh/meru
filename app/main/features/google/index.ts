import { DisposableStore } from "../../../core/disposable.ts";
import type { Unsubscribe } from "../../../core/ports.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { ok } from "../../../core/result.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { googlePushes } from "../../../shared/channels/google.ts";
import type { MeetToggle } from "../../../shared/channels/google.ts";
import {
  contentSurfaceArgument,
  googleSurface,
} from "../../../shared/channels/surfaces.ts";
import type { CommandRegistrar } from "../../../shared/commands/define.ts";
import type { ContentPage } from "../stage/tab-views.ts";
import { googleCommands } from "./commands.ts";

export interface GoogleOptions {
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
  /** The built Google preload. */
  readonly preload: string;
}

/** The pages of the Google apps other than Gmail: their preload, and Meet's microphone and camera as commands. */
export class Google {
  readonly #options: GoogleOptions;
  readonly #disposables = new DisposableStore();
  /** Meet's pages, the latest opened last, which the toggles act on as 3.x's did. */
  readonly #meets: number[] = [];

  constructor(options: GoogleOptions) {
    this.#options = options;
  }

  start(): void {
    const toggle = (which: MeetToggle) => ({
      run: () => {
        const contentsId = this.#meets.at(-1);
        if (contentsId !== undefined) {
          this.#options.registrar.push(contentsId, googlePushes.meetToggle, {
            toggle: which,
          });
        }
        return ok(undefined);
      },
      when: () => this.#meets.length > 0,
    });
    this.#disposables.add(
      this.#options.commands.register(googleCommands, {
        toggleMeetCamera: toggle("camera"),
        toggleMeetMicrophone: toggle("microphone"),
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  /** The preload and surface of a Google app's tab other than Gmail. */
  page(tab: Tab): ContentPage {
    return {
      arguments: [contentSurfaceArgument("google")],
      attach: (contentsId): Unsubscribe => {
        const unassign = this.#options.registrar.assign(
          contentsId,
          googleSurface,
          tab.profileId
        );
        if (tab.appId === "meet") {
          this.#meets.push(contentsId);
        }
        return () => {
          unassign();
          const index = this.#meets.indexOf(contentsId);
          if (index !== -1) {
            this.#meets.splice(index, 1);
          }
        };
      },
      preload: this.#options.preload,
    };
  }
}
