import type { TrayPort, TraySpec } from "../../core/ports.ts";
import type { Platform } from "../../core/records/platform.ts";

export class FakeTray implements TrayPort {
  /** What the icon shows, or undefined while it is down. */
  spec: TraySpec | undefined;
  #click: (() => void) | undefined;
  readonly #platform: Platform;

  constructor(platform: Platform) {
    this.#platform = platform;
  }

  readonly show = (spec: TraySpec, onClick: () => void) => {
    this.spec = spec;
    this.#click = onClick;
  };

  readonly hide = () => {
    this.spec = undefined;
    this.#click = undefined;
  };

  /** Clicks the icon, as a click that opens no menu; Linux opens the menu on any click and sends none. */
  readonly click = () => {
    if (this.#platform === "linux") {
      throw new Error("A tray on Linux sends no click");
    }
    this.#click?.();
  };

  /** Picks the menu item labelled `label`. */
  readonly pick = (label: string) => {
    const item = this.spec?.menu.find(
      (found) => found.kind === "item" && found.label === label
    );
    if (item?.kind === "item") {
      item.run();
    }
  };
}
