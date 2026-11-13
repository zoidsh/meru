import { clampToDisplay } from "../../core/engines/bounds.ts";
import { chromeColors, titleBarOf } from "../../core/engines/chrome.ts";
import { themeOf } from "../../core/ports.ts";
import type { Ports, Unsubscribe, WindowPort } from "../../core/ports.ts";
import type { Theme } from "../../core/records/theme.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import {
  pageSurfaces,
  surfaceArgument,
} from "../../shared/channels/surfaces.ts";
import { msg } from "../../shared/msg.ts";
import { pageUrl, recolour } from "./window.ts";
import type { PageOptions } from "./window.ts";

/** 3.x's settings window size, shrunk to a smaller display. */
export const SETTINGS_WINDOW_SIZE = { height: 720, width: 1000 } as const;

export interface SettingsWindowOptions {
  readonly ports: Pick<Ports, "displays" | "lifecycle" | "theme" | "windows">;
  readonly registrar: Pick<IpcRegistrar, "assign">;
  readonly preload: string;
  readonly pages: PageOptions;
  /** Open behind whatever is in front, for a desktop other sessions share. */
  readonly background: boolean;
  readonly linuxControls: boolean;
}

/** The one settings window: opened on the primary display's centre, or brought to the front while it is open. */
export class SettingsWindow {
  readonly #options: SettingsWindowOptions;
  #window: WindowPort | undefined;

  constructor(options: SettingsWindowOptions) {
    this.#options = options;
  }

  get window(): WindowPort | undefined {
    return this.#window;
  }

  async open(): Promise<void> {
    const { ports, preload, pages, background, linuxControls, registrar } =
      this.#options;
    if (this.#window !== undefined) {
      this.#window.show();
      return;
    }
    const theme = themeOf(ports.theme);
    const window = ports.windows.create({
      arguments: [surfaceArgument("settings")],
      background: chromeColors(theme).background,
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
    const unassign: Unsubscribe = registrar.assign(
      window.contentsId,
      pageSurfaces.settings
    );
    window.onClosed(() => {
      unassign();
      this.#window = undefined;
    });
    await window.loadUrl(pageUrl(pages, "settings.html"));
    if (background) {
      window.showInactive();
    } else {
      window.show();
    }
  }

  recolour(theme: Theme): void {
    if (this.#window !== undefined) {
      const { linuxControls, ports } = this.#options;
      recolour(this.#window, theme, ports.lifecycle.platform, linuxControls);
    }
  }
}
