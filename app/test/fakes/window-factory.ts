import type { WindowFactoryPort, WindowSpec } from "../../core/ports.ts";
import { FakeWindow } from "./window.ts";

export class FakeWindows implements WindowFactoryPort {
  readonly specs: WindowSpec[] = [];
  readonly created: FakeWindow[] = [];

  readonly create = (spec: WindowSpec): FakeWindow => {
    const window = new FakeWindow();
    this.specs.push(spec);
    this.created.push(window);
    return window;
  };

  /** The window made `index`th; throws if fewer were made. */
  readonly window = (index = 0): FakeWindow => {
    const window = this.created[index];
    if (window === undefined) {
      throw new Error(`No window ${index} was made`);
    }
    return window;
  };
}
