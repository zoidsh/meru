import type { ViewFactoryPort, ViewPort } from "../../../core/ports.ts";
import type { Layout, Orientation } from "../../../core/records/layout.ts";

const TRANSPARENT = "#00000000";

const dragPage = (orientation: Orientation) =>
  `data:text/html,<html style="cursor:${orientation === "vertical" ? "col-resize" : "row-resize"};height:100%"></html>`;

// Pointer events over a pane go to that pane's renderer, so the chrome page cannot follow a drag across one by itself; a transparent view over every pane catches the pointer for the drag's duration.
/** A divider's drag: the overlay that catches the pointer, and the layout as the pointer left it, which the group takes on release. */
export class DragOverlay {
  readonly splitId: string;
  readonly view: ViewPort;
  layout: Layout;
  ratio: number | undefined;

  constructor(options: {
    readonly views: ViewFactoryPort;
    readonly preload: string | undefined;
    readonly splitId: string;
    readonly orientation: Orientation;
    readonly layout: Layout;
    readonly onError: (error: unknown) => void;
  }) {
    this.splitId = options.splitId;
    this.layout = options.layout;
    this.ratio = undefined;
    this.view = options.views.create({
      preload: options.preload,
      radius: 0,
      zoom: 1,
    });
    this.view.setBackgroundColor(TRANSPARENT);
    const { view } = this;
    const load = async () => {
      try {
        await view.loadURL(dragPage(options.orientation));
      } catch (error) {
        options.onError(error);
      }
    };
    void load();
  }
}
