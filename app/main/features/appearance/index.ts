import { DisposableStore } from "../../../core/disposable.ts";
import { themeOf } from "../../../core/ports.ts";
import type { ThemePort } from "../../../core/ports.ts";
import type { Theme } from "../../../core/records/theme.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { themePushes } from "../../../shared/channels/theme.ts";

interface AppearanceOptions {
  readonly theme: ThemePort;
  readonly registrar: Pick<IpcRegistrar, "broadcast">;
  /** The windows whose ground and title bar take the theme's colours. */
  readonly windows: readonly { readonly recolour: (theme: Theme) => void }[];
}

/** Follows the system's theme: repaints every window in it and tells every page. */
export class Appearance {
  readonly #options: AppearanceOptions;
  readonly #disposables = new DisposableStore();

  constructor(options: AppearanceOptions) {
    this.#options = options;
  }

  start(): void {
    const { registrar, theme, windows } = this.#options;
    this.#disposables.add(
      theme.onChange(() => {
        const current = themeOf(theme);
        for (const window of windows) {
          window.recolour(current);
        }
        registrar.broadcast(themePushes.changed, { theme: current });
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }
}
