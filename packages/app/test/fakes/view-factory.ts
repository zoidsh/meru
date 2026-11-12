import type { ViewFactoryPort, ViewSpec } from "../../core/ports.ts";
import { FakeView } from "./view.ts";

export class FakeViewFactory implements ViewFactoryPort {
  readonly created: FakeView[] = [];

  readonly create = (spec: ViewSpec): FakeView => {
    const view = new FakeView(spec);
    this.created.push(view);
    return view;
  };

  get alive(): FakeView[] {
    return this.created.filter((view) => !view.destroyed);
  }
}
