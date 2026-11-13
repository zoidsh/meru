import { DisposableStore } from "../../../core/disposable.ts";
import { clampToDisplay } from "../../../core/engines/bounds.ts";
import { titleBarOf, windowColours } from "../../../core/engines/chrome.ts";
import { themeOf } from "../../../core/ports.ts";
import type { Ports, WindowPort } from "../../../core/ports.ts";
import type { Theme } from "../../../core/records/theme.ts";
import { err, ok } from "../../../core/result.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { shortcuts } from "../../../shared/channels/shortcuts.ts";
import {
  pageSurfaces,
  surfaceArgument,
} from "../../../shared/channels/surfaces.ts";
import type { CommandRegistrar } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";
import { settingsCommands } from "./commands.ts";

/** 3.x's settings window size, shrunk to a smaller display. */
export const SETTINGS_WINDOW_SIZE = { height: 720, width: 1000 } as const;

export interface SettingsWindowOptions {
  readonly ports: Pick<Ports, "displays" | "lifecycle" | "theme" | "windows">;
  readonly registrar: Pick<IpcRegistrar, "assign" | "register">;
  readonly commands: CommandRegistrar;
  readonly preload: string;
  /** The settings page's address, which carries the theme at the moment it is asked. */
  readonly url: () => string;
  /** Open behind whatever is in front, for a desktop other sessions share. */
  readonly background: boolean;
  readonly linuxControls: boolean;
  readonly onError: (error: unknown) => void;
}

/** The one settings window, opened by `settings.open`: on the primary display's centre, or brought to the front while it is open. */
export class SettingsWindow {
  readonly #options: SettingsWindowOptions;
  readonly #disposables = new DisposableStore();
  #window: WindowPort | undefined;

  constructor(options: SettingsWindowOptions) {
    this.#options = options;
  }

  get window(): WindowPort | undefined {
    return this.#window;
  }

  start(): void {
    this.#disposables.add(
      this.#options.commands.register(settingsCommands, {
        open: () => {
          this.open().catch(this.#options.onError);
          return ok(null);
        },
      }),
      this.#options.registrar.register(shortcuts, {
        recording: ({ recording }, { contentsId }) => {
          if (this.#window?.contentsId !== contentsId) {
            return err("not the settings window");
          }
          this.#window.setIgnoreMenuShortcuts(recording);
          return ok(undefined);
        },
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  async open(): Promise<void> {
    const { ports, preload, url, background, linuxControls, registrar } =
      this.#options;
    if (this.#window !== undefined) {
      this.#window.show();
      return;
    }
    const theme = themeOf(ports.theme);
    const window = ports.windows.create({
      arguments: [surfaceArgument("settings")],
      background: windowColours({
        linuxControls,
        platform: ports.lifecycle.platform,
        theme,
      }).background,
      bounds: clampToDisplay(
        undefined,
        ports.displays.displays(),
        SETTINGS_WINDOW_SIZE
      ),
      preload,
      title: msg`Settings`,
      titleBar: titleBarOf({
        linuxControls,
        platform: ports.lifecycle.platform,
        theme,
      }),
    });
    this.#window = window;
    const unassign = registrar.assign(window.contentsId, pageSurfaces.settings);
    window.onClosed(() => {
      unassign();
      this.#window = undefined;
    });
    await window.loadUrl(url());
    if (background) {
      window.showInactive();
    } else {
      window.show();
    }
  }

  recolour(theme: Theme): void {
    if (this.#window === undefined) {
      return;
    }
    const { linuxControls, ports } = this.#options;
    const colours = windowColours({
      linuxControls,
      platform: ports.lifecycle.platform,
      theme,
    });
    this.#window.setBackgroundColor(colours.background);
    if (colours.overlay !== null) {
      this.#window.setTitleBarOverlay(colours.overlay);
    }
  }
}
