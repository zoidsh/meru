import type { TrayPort, TraySpec } from "../../core/ports.ts";

export class FakeTray implements TrayPort {
  /** What the icon shows, or undefined while it is down. */
  spec: TraySpec | undefined;
  #click: (() => void) | undefined;

  readonly show = (spec: TraySpec, onClick: () => void) => {
    this.spec = spec;
    this.#click = onClick;
  };

  readonly hide = () => {
    this.spec = undefined;
    this.#click = undefined;
  };

  /** Clicks the icon, as a click that opens no menu. */
  readonly click = () => {
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
